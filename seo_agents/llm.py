"""Facade used by the SEO pipeline: runs a task through the configured model chain with fallback."""
from __future__ import annotations

import logging
from contextvars import ContextVar
from typing import Any, Optional, Type

from seo_agents.ai.ai_config import effective_chain, load_config
from seo_agents.ai.base import T
from seo_agents.ai.fallback import AllProvidersFailed, run_with_fallback
from seo_agents.config import get_settings

logger = logging.getLogger("seo_agents.llm")
_usage: ContextVar[Optional[list[dict[str, Any]]]] = ContextVar("ai_usage", default=None)


class LLMError(RuntimeError):
    """Raised when no configured model could complete the task."""


def start_usage_log() -> None:
    _usage.set([])


def drain_usage() -> list[dict[str, Any]]:
    items = _usage.get() or []
    _usage.set([])
    return items


def generate_structured(
    prompt: str,
    schema: Type[T],
    *,
    system: Optional[str] = None,
    temperature: float = 0.3,
) -> T:
    """Run the task and return a validated `schema` instance, using fallbacks when needed."""
    settings = get_settings()
    config, _ = load_config()
    try:
        result = run_with_fallback(
            prompt,
            schema,
            chain=effective_chain(config),
            system=system,
            temperature=temperature,
            attempts_per_model=max(2, settings.llm_max_retries - 1),
            deadline_seconds=settings.ai_deadline_seconds,
            timeout_seconds=settings.llm_timeout_seconds,
        )
    except AllProvidersFailed as exc:
        raise LLMError(str(exc)) from exc
    log = _usage.get()
    if log is not None:
        log.append({
            "provider": result.provider,
            "model": result.model,
            "attempts": result.attempts,
            "fallback_used": result.fallback_used,
        })
    return result.value
