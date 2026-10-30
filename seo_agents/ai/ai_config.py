"""Which models to use: primary + fallbacks. Stored in the database, defaulting to environment settings."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import List

from pydantic import BaseModel, Field, field_validator

from seo_agents.ai.registry import provider_names
from seo_agents.config import get_settings
from seo_agents.database import store

logger = logging.getLogger("seo_agents.ai.config")
_MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/\-]{0,99}$")
SETTING_KEY = "ai_config"

# Suggestions only. Availability depends on each account, so use "Test connection".
DEFAULT_CATALOG: dict[str, list[str]] = {
    "gemini": ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
    "groq": ["openai/gpt-oss-20b", "openai/gpt-oss-120b"],
    "openai": ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4"],
    "anthropic": ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
}


def catalog() -> dict[str, list[str]]:
    """Model suggestions per provider; override with AI_MODEL_CATALOG='{"groq": ["model-id"]}'."""
    result = {k: list(v) for k, v in DEFAULT_CATALOG.items()}
    raw = os.getenv("AI_MODEL_CATALOG", "").strip()
    if raw:
        try:
            for name, models in json.loads(raw).items():
                if name in result and isinstance(models, list):
                    result[name] = [m for m in models if isinstance(m, str) and _MODEL_ID.match(m)]
        except (ValueError, AttributeError):
            logger.warning("AI_MODEL_CATALOG is not valid JSON; using defaults")
    return result


class ModelRef(BaseModel):
    provider: str
    model: str

    @field_validator("provider")
    @classmethod
    def _provider(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in provider_names():
            raise ValueError("provider must be one of: " + ", ".join(provider_names()))
        return v

    @field_validator("model")
    @classmethod
    def _model(cls, v: str) -> str:
        v = v.strip()
        if not _MODEL_ID.match(v):
            raise ValueError("model id may only contain letters, digits and . _ : / -")
        return v

    @property
    def key(self) -> tuple[str, str]:
        return (self.provider, self.model)




class AIConfig(BaseModel):
    primary: ModelRef
    fallbacks: List[ModelRef] = Field(default_factory=list, max_length=4)
    fallback_enabled: bool = True


def _parse_ref(text: str) -> ModelRef:
    provider, _, model = text.strip().partition(":")
    return ModelRef(provider=provider, model=model)


def env_config() -> AIConfig:
    settings = get_settings()
    primary = _parse_ref(settings.ai_primary) if settings.ai_primary else ModelRef(provider="gemini", model=settings.model_id)
    fallbacks: list[ModelRef] = []
    for item in [s for s in settings.ai_fallbacks.split(",") if s.strip()]:
        try:
            fallbacks.append(_parse_ref(item))
        except ValueError:
            logger.warning("ignoring invalid AI_FALLBACKS entry")
    legacy = os.getenv("LLM_FALLBACK_MODEL", "").strip()  # older setting: a backup Gemini model
    if legacy:
        try:
            fallbacks.append(ModelRef(provider="gemini", model=legacy))
        except ValueError:
            pass
    return AIConfig(primary=primary, fallbacks=fallbacks[:4])


def load_config() -> tuple[AIConfig, str]:
    """Returns (config, source) where source is 'database' or 'environment'."""
    try:
        raw = store.get_setting(SETTING_KEY)
        if raw:
            return AIConfig.model_validate_json(raw), "database"
    except Exception:
        logger.warning("could not read saved AI settings; using environment defaults", exc_info=True)
    return env_config(), "environment"


def save_config(config: AIConfig) -> None:
    store.set_setting(SETTING_KEY, config.model_dump_json())


def effective_chain(config: AIConfig) -> list[ModelRef]:
    """Primary first, then fallbacks (if enabled), never the same model twice."""
    chain: list[ModelRef] = []
    seen: set[tuple[str, str]] = set()
    for ref in [config.primary, *(config.fallbacks if config.fallback_enabled else [])]:
        if ref.key not in seen:
            seen.add(ref.key)
            chain.append(ref)
    return chain
