from __future__ import annotations

from typing import Optional, Type

import httpx

from seo_agents.ai import base
from seo_agents.ai.base import AIProviderError, Provider, T, error_from_http, json_instruction, network_error, parse_json_output
from seo_agents.config import get_settings

URL = "https://api.anthropic.com/v1/messages"


class AnthropicProvider(Provider):
    name = "anthropic"
    label = "Anthropic Claude"

    def is_configured(self) -> bool:
        return bool(get_settings().anthropic_api_key)

    def generate_json(self, *, model: str, prompt: str, schema: Type[T], system: Optional[str],
                      temperature: float, timeout: float) -> T:
        body: dict = {
            "model": model,
            "max_tokens": 8192,
            "temperature": temperature,
            "messages": [{"role": "user", "content": f"{prompt}\n\n{json_instruction(schema)}"}],
        }
        if system:
            body["system"] = system
        headers = {"x-api-key": get_settings().anthropic_api_key, "anthropic-version": "2023-06-01"}
        try:
            with httpx.Client(timeout=timeout, transport=base.HTTP_TRANSPORT) as client:
                response = client.post(URL, json=body, headers=headers)
        except httpx.HTTPError as exc:
            raise network_error(self.name, model, exc) from exc
        if response.status_code >= 400:
            raise error_from_http(self.name, model, response.status_code, response.text, response.headers.get("retry-after"))
        try:
            blocks = response.json()["content"]
            text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            raise AIProviderError(self.name, model, "invalid_output", "unexpected response format") from exc
        return parse_json_output(text, schema, self.name, model)
