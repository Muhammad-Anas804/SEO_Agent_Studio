from __future__ import annotations

from functools import lru_cache
from typing import Optional, Type

from seo_agents.ai.base import AIProviderError, Provider, T, error_from_http, parse_json_output
from seo_agents.config import get_settings


@lru_cache
def _client(api_key: str, timeout_ms: int):
    from google import genai
    from google.genai import types

    return genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=timeout_ms))


def _map_error(model: str, exc: Exception) -> AIProviderError:
    text = str(exc)
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if isinstance(code, int):
        return error_from_http("gemini", model, code, text)
    upper = text.upper()
    if "RESOURCE_EXHAUSTED" in upper:
        return error_from_http("gemini", model, 429, text)
    if "UNAVAILABLE" in upper or " 503" in text:
        return error_from_http("gemini", model, 503, text)
    if "PERMISSION_DENIED" in upper or "UNAUTHENTICATED" in upper or "API KEY" in upper:
        return error_from_http("gemini", model, 401, text)
    if "TIMED OUT" in upper or "TIMEOUT" in upper:
        return AIProviderError("gemini", model, "timeout", text)
    return AIProviderError("gemini", model, "unknown", text)


class GeminiProvider(Provider):
    name = "gemini"
    label = "Google Gemini"

    def is_configured(self) -> bool:
        return bool(get_settings().gemini_api_key)

    def generate_json(self, *, model: str, prompt: str, schema: Type[T], system: Optional[str],
                      temperature: float, timeout: float) -> T:
        from google.genai import types

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=temperature,
            system_instruction=system,
        )
        try:
            client = _client(get_settings().gemini_api_key, int(timeout * 1000))
            response = client.models.generate_content(model=model, contents=prompt, config=config)
        except Exception as exc:  # the SDK raises several error types
            raise _map_error(model, exc) from exc
        if isinstance(response.parsed, schema):
            return response.parsed
        if response.text:
            return parse_json_output(response.text, schema, self.name, model)
        raise AIProviderError(self.name, model, "invalid_output", "empty response")
