"""Image generation providers: OpenAI gpt-image models and Gemini native image generation."""
from __future__ import annotations

import base64
import binascii
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from functools import lru_cache

import httpx

from seo_agents.ai import base
from seo_agents.ai.base import clean_message
from seo_agents.config import get_settings


class ImageError(Exception):
    """kind: not_configured, auth, rate_limit, quota, rejected, invalid_model, bad_request, unavailable, timeout, network, invalid_output"""

    def __init__(self, kind: str, message: str):
        self.kind, self.message = kind, clean_message(message)
        super().__init__(f"{kind}: {self.message}")


@dataclass
class GeneratedImage:
    data: bytes
    provider: str
    model: str


class ImageProvider(ABC):
    name = ""
    default_model = ""

    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    def generate(self, prompt: str, model: str, timeout: float) -> GeneratedImage: ...


def _http_error(status: int, text: str) -> ImageError:
    lower = text.lower()
    if status in (401, 403):
        return ImageError("auth", f"HTTP {status}: {text}")
    if status == 404:
        return ImageError("invalid_model", f"HTTP {status}: {text}")
    if status == 429:
        quota = any(w in lower for w in ("insufficient_quota", "billing", "neurons", "daily free allocation"))
        return ImageError("quota" if quota else "rate_limit", f"HTTP {status}: {text}")
    if status == 400 and any(w in lower for w in ("safety", "moderation", "content_policy", "policy", "blocked")):
        return ImageError("rejected", f"The image request was refused by the provider's safety rules. {text}")
    if status >= 500:
        return ImageError("unavailable", f"HTTP {status}: {text}")
    return ImageError("bad_request", f"HTTP {status}: {text}")


class OpenAIImages(ImageProvider):
    name = "openai"
    default_model = "gpt-image-1-mini"

    def is_configured(self) -> bool:
        return bool(get_settings().openai_api_key)

    def generate(self, prompt: str, model: str, timeout: float) -> GeneratedImage:
        settings = get_settings()
        body = {"model": model, "prompt": prompt, "n": 1, "size": "1536x1024", "quality": settings.image_quality}
        try:
            with httpx.Client(timeout=timeout, transport=base.HTTP_TRANSPORT) as client:
                response = client.post("https://api.openai.com/v1/images/generations", json=body,
                                       headers={"Authorization": f"Bearer {settings.openai_api_key}"})
        except httpx.TimeoutException as exc:
            raise ImageError("timeout", str(exc)) from exc
        except httpx.HTTPError as exc:
            raise ImageError("network", str(exc)) from exc
        if response.status_code >= 400:
            raise _http_error(response.status_code, response.text)
        try:
            encoded = response.json()["data"][0]["b64_json"]
            return GeneratedImage(base64.b64decode(encoded, validate=True), self.name, model)
        except (KeyError, IndexError, TypeError, ValueError, binascii.Error) as exc:
            raise ImageError("invalid_output", "unexpected image response format") from exc


@lru_cache
def _gemini_client(api_key: str, timeout_ms: int):
    from google import genai
    from google.genai import types

    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=timeout_ms))


class GeminiImages(ImageProvider):
    name = "gemini"
    default_model = "gemini-2.5-flash-image"

    def is_configured(self) -> bool:
        return bool(get_settings().gemini_api_key)

    def generate(self, prompt: str, model: str, timeout: float) -> GeneratedImage:
        from google.genai import types

        try:
            client = _gemini_client(get_settings().gemini_api_key, int(timeout * 1000))
            response = client.models.generate_content(
                model=model, contents=prompt,
                config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
            )
        except Exception as exc:  # the SDK raises several error types
            text = str(exc)
            code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
            if "limit: 0" in text or "free_tier" in text.lower():
                raise ImageError("quota", "Gemini image generation is not available on the free tier. Enable billing or use OpenAI.") from exc
            if isinstance(code, int):
                raise _http_error(code, text) from exc
            raise ImageError("timeout" if "timeout" in text.lower() else "network", text) from exc
        for candidate in response.candidates or []:
            for part in (candidate.content.parts if candidate.content else None) or []:
                inline = getattr(part, "inline_data", None)
                if inline is not None and inline.data:
                    return GeneratedImage(inline.data, self.name, model)
        raise ImageError("rejected", "The model returned no image (it may have been blocked by safety filters).")


_ACCOUNT_ID = re.compile(r"^[0-9a-f]{32}$")
_CF_MODEL = re.compile(r"^@cf/[A-Za-z0-9._\-]+/[A-Za-z0-9._\-]+$")


class CloudflareImages(ImageProvider):
    """Cloudflare Workers AI (FLUX.1 schnell): has a free daily allowance, no card needed."""

    name = "cloudflare"
    default_model = "@cf/black-forest-labs/flux-1-schnell"

    def is_configured(self) -> bool:
        settings = get_settings()
        return bool(settings.cloudflare_api_token and settings.cloudflare_account_id)

    def generate(self, prompt: str, model: str, timeout: float) -> GeneratedImage:
        settings = get_settings()
        if not _ACCOUNT_ID.match(settings.cloudflare_account_id):
            raise ImageError("not_configured", "CLOUDFLARE_ACCOUNT_ID must be the 32-character account id from the Cloudflare dashboard")
        if not _CF_MODEL.match(model):
            raise ImageError("invalid_model", "model must look like @cf/black-forest-labs/flux-1-schnell")
        url = f"https://api.cloudflare.com/client/v4/accounts/{settings.cloudflare_account_id}/ai/run/{model}"
        try:
            with httpx.Client(timeout=timeout, transport=base.HTTP_TRANSPORT) as client:
                response = client.post(url, json={"prompt": prompt, "steps": 6},
                                       headers={"Authorization": f"Bearer {settings.cloudflare_api_token}"})
        except httpx.TimeoutException as exc:
            raise ImageError("timeout", str(exc)) from exc
        except httpx.HTTPError as exc:
            raise ImageError("network", str(exc)) from exc
        if response.status_code >= 400:
            lower = response.text.lower()
            if "neurons" in lower or "daily free allocation" in lower:
                raise ImageError("quota", "The free daily allowance on Cloudflare Workers AI is used up. It resets daily.")
            if any(w in lower for w in ("nsfw", "flagged", "safety")):
                raise ImageError("rejected", f"The image request was refused by the provider's safety rules. {response.text}")
            raise _http_error(response.status_code, response.text)
        try:
            encoded = response.json()["result"]["image"]
            return GeneratedImage(base64.b64decode(encoded, validate=True), self.name, model)
        except (KeyError, TypeError, ValueError, binascii.Error) as exc:
            raise ImageError("invalid_output", "unexpected image response format") from exc


_PROVIDERS: dict[str, ImageProvider] = {p.name: p for p in (OpenAIImages(), GeminiImages(), CloudflareImages())}


def get_image_provider(name: str) -> ImageProvider:
    try:
        return _PROVIDERS[name]
    except KeyError:
        raise ImageError("not_configured", f"unknown IMAGE_PROVIDER '{name}' (use cloudflare, openai or gemini)") from None
