"""Shared pieces for AI providers: errors, classification, JSON prompt/parse helpers."""
from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from typing import Optional, Type, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)

# Tests inject an httpx mock transport here; production leaves it None.
HTTP_TRANSPORT: Optional[httpx.BaseTransport] = None

RETRYABLE_KINDS = {"rate_limit", "overloaded", "timeout", "network", "invalid_output", "unknown"}

_SECRET = re.compile(
    r"(?i)((?:api[_-]?key|authorization|bearer|x-api-key)\W{0,3})[A-Za-z0-9_\-\.]{8,}"
    r"|AIza[0-9A-Za-z_\-]{20,}|sk-[A-Za-z0-9_\-]{12,}|gsk_[A-Za-z0-9]{12,}"
)
_RETRY_DELAY = re.compile(r"'retryDelay': '([0-9.]+)s'")
_RETRY_IN = re.compile(r"retry in ([0-9.]+)s", re.IGNORECASE)


def clean_message(message: str) -> str:
    """Single line, secrets redacted, bounded length: safe to log and show."""
    text = _SECRET.sub(lambda m: (m.group(1) or "") + "[redacted]", " ".join(str(message).split()))
    return text[:300]


class AIProviderError(Exception):
    def __init__(self, provider: str, model: str, kind: str, message: str, retry_after: Optional[float] = None):
        self.provider, self.model, self.kind = provider, model, kind
        self.message = clean_message(message)
        self.retry_after = retry_after
        super().__init__(f"{provider}/{model}: {kind}: {self.message}")

    @property
    def retryable(self) -> bool:
        return self.kind in RETRYABLE_KINDS


def _retry_hint(text: str, header: Optional[str]) -> Optional[float]:
    if header:
        try:
            return min(float(header), 120.0)
        except ValueError:
            pass
    for pattern in (_RETRY_DELAY, _RETRY_IN):
        match = pattern.search(text)
        if match:
            return min(float(match.group(1)) + 1.0, 120.0)
    return None


def error_from_http(provider: str, model: str, status: int, body: str, retry_after_header: Optional[str] = None) -> AIProviderError:
    lower = body.lower()
    hint = _retry_hint(body, retry_after_header)
    if status in (401, 403):
        kind = "auth"
    elif status == 404 or (
        status in (400, 422)
        and "model" in lower
        and any(w in lower for w in ("not found", "does not exist", "invalid", "unsupported", "decommissioned", "not supported"))
    ):
        kind = "invalid_model"
    elif status == 429:
        kind = "quota_exhausted" if ("perday" in lower or "insufficient_quota" in lower) else "rate_limit"
    elif status == 408:
        kind = "timeout"
    elif status >= 500:
        kind = "overloaded"
    elif 400 <= status < 500:
        kind = "bad_request"
    else:
        kind = "unknown"
    return AIProviderError(provider, model, kind, f"HTTP {status}: {body}", hint)


def json_instruction(schema: Type[BaseModel]) -> str:
    return (
        "Respond with ONLY one JSON object (no markdown, no commentary) that matches this JSON Schema:\n"
        + json.dumps(schema.model_json_schema())
    )


def parse_json_output(text: str, schema: Type[T], provider: str, model: str) -> T:
    """Extract and validate a JSON object from model text; never trust unvalidated output."""
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```[a-zA-Z]*\s*|\s*```$", "", candidate).strip()
    start, end = candidate.find("{"), candidate.rfind("}")
    if start == -1 or end <= start:
        raise AIProviderError(provider, model, "invalid_output", "response contained no JSON object")
    try:
        return schema.model_validate(json.loads(candidate[start : end + 1], strict=False))
    except (ValidationError, ValueError) as exc:
        raise AIProviderError(provider, model, "invalid_output", f"response did not match the schema: {exc}") from exc


def network_error(provider: str, model: str, exc: Exception) -> AIProviderError:
    kind = "timeout" if isinstance(exc, httpx.TimeoutException) else "network"
    return AIProviderError(provider, model, kind, str(exc) or exc.__class__.__name__)


class Provider(ABC):
    name: str = ""
    label: str = ""

    @abstractmethod
    def is_configured(self) -> bool:
        """True when the provider's API key is present (never reveals the key)."""

    @abstractmethod
    def generate_json(self, *, model: str, prompt: str, schema: Type[T], system: Optional[str],
                      temperature: float, timeout: float) -> T:
        """Return a validated instance of `schema` or raise AIProviderError."""
