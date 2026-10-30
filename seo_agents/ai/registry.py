from __future__ import annotations

from functools import lru_cache

from seo_agents.ai.anthropic import AnthropicProvider
from seo_agents.ai.base import Provider
from seo_agents.ai.gemini import GeminiProvider
from seo_agents.ai.openai_compat import OpenAICompatProvider


@lru_cache
def _providers() -> dict[str, Provider]:
    items: list[Provider] = [
        GeminiProvider(),
        OpenAICompatProvider("groq", "Groq", "https://api.groq.com/openai/v1", "groq_api_key"),
        OpenAICompatProvider("openai", "OpenAI", "https://api.openai.com/v1", "openai_api_key"),
        AnthropicProvider(),
    ]
    return {p.name: p for p in items}


def provider_names() -> list[str]:
    return list(_providers())


def get_provider(name: str) -> Provider:
    try:
        return _providers()[name]
    except KeyError:
        raise KeyError(f"unknown AI provider: {name}") from None
