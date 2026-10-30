"""OpenAI-style chat completions: used for both OpenAI and Groq."""
from __future__ import annotations

from typing import Optional, Type

import httpx

from seo_agents.ai import base
from seo_agents.ai.base import AIProviderError, Provider, T, error_from_http, json_instruction, network_error, parse_json_output
from seo_agents.config import get_settings

# Reasoning-style models reject a custom temperature.
_NO_TEMPERATURE_PREFIXES = ("gpt-5", "o1", "o3", "o4")


def _mentions_json_mode(text: str) -> bool:
    lower = text.lower()
    return any(word in lower for word in ("response_format", "json_object", "json mode", "json_schema", "failed to generate json", "json_validate_failed", "failed_generation"))


class OpenAICompatProvider(Provider):
    def __init__(self, name: str, label: str, base_url: str, key_attr: str):
        self.name, self.label, self.base_url, self.key_attr = name, label, base_url.rstrip("/"), key_attr

    def is_configured(self) -> bool:
        return bool(getattr(get_settings(), self.key_attr))

    def _post(self, body: dict, key: str, model: str, timeout: float) -> httpx.Response:
        try:
            with httpx.Client(timeout=timeout, transport=base.HTTP_TRANSPORT) as client:
                return client.post(f"{self.base_url}/chat/completions", json=body,
                                   headers={"Authorization": f"Bearer {key}"})
        except httpx.HTTPError as exc:
            raise network_error(self.name, model, exc) from exc

    def generate_json(self, *, model: str, prompt: str, schema: Type[T], system: Optional[str],
                      temperature: float, timeout: float) -> T:
        key = getattr(get_settings(), self.key_attr)
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": f"{prompt}\n\n{json_instruction(schema)}"})
        body: dict = {"model": model, "messages": messages, "response_format": {"type": "json_object"}, "max_completion_tokens": 8000}
        if not model.startswith(_NO_TEMPERATURE_PREFIXES):
            body["temperature"] = temperature
        response = self._post(body, key, model, timeout)
        if response.status_code == 400 and _mentions_json_mode(response.text):
            # Some models reject response_format; the prompt already demands JSON, so retry without it.
            body.pop("response_format", None)
            response = self._post(body, key, model, timeout)
        if response.status_code >= 400:
            raise error_from_http(self.name, model, response.status_code, response.text, response.headers.get("retry-after"))
        try:
            text = response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise AIProviderError(self.name, model, "invalid_output", "unexpected response format") from exc
        return parse_json_output(text or "", schema, self.name, model)
