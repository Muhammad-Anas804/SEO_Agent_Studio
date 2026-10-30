"""
LangChain model layer: the ONLY place LangChain chat models are used.

Providers are imported lazily, so the graph runs without these packages.
Install what you use:
    pip install langchain-anthropic langchain-google-genai langchain-openai

Model names are NOT hard-coded here. Step 2 reads them from your existing
seo_agents/ai/ai_config.py so AI Settings keeps working.
"""
from __future__ import annotations


def make_chat_model(provider: str, model: str, **kwargs):
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, **kwargs)
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, **kwargs)
    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, **kwargs)
    raise ValueError(f"Unknown provider: {provider}")


def with_fallback(primary, *backups):
    """Replaces your custom fallback.py: tries each model in order on failure."""
    return primary.with_fallbacks(list(backups)) if backups else primary