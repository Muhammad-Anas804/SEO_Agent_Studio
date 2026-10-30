"""Run one AI task across a chain of models: bounded retries, error-aware, with an overall deadline."""
from __future__ import annotations

import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Optional, Sequence, Type

from pydantic import BaseModel

from seo_agents.ai.ai_config import ModelRef
from seo_agents.ai.base import AIProviderError, T
from seo_agents.ai.registry import get_provider

logger = logging.getLogger("seo_agents.ai.fallback")
_last_call: dict[str, float] = {}
_throttle_lock = threading.Lock()
LONG_WAIT_SECONDS = 30.0  # with a fallback available, never sit out a longer rate-limit wait


@dataclass
class Attempt:
    provider: str
    model: str
    outcome: str  # "ok" or an error kind
    duration_ms: int = 0


@dataclass
class AIResult:
    value: BaseModel
    provider: str
    model: str
    attempts: int
    fallback_used: bool
    trail: list[Attempt] = field(default_factory=list)


class AllProvidersFailed(RuntimeError):
    def __init__(self, trail: list[Attempt]):
        self.trail = trail
        summary = ", ".join(f"{a.provider}/{a.model}: {a.outcome}" for a in dedupe_trail(trail)) or "no model was available"
        super().__init__(f"All configured AI models failed ({summary}). Check your AI settings and API keys, then try again.")


def dedupe_trail(trail: list[Attempt]) -> list[Attempt]:
    last: dict[tuple[str, str], Attempt] = {}
    for a in trail:
        last[(a.provider, a.model)] = a
    return list(last.values())


def _throttle(provider: str, sleep: Callable[[float], None]) -> None:
    """Space out calls per provider (LLM_MIN_INTERVAL_SECONDS) for free-tier rate limits."""
    try:
        interval = float(os.getenv("LLM_MIN_INTERVAL_SECONDS", "0"))
    except ValueError:
        interval = 0.0
    if interval <= 0:
        return
    with _throttle_lock:
        wait = _last_call.get(provider, 0.0) + interval - time.monotonic()
        if wait > 0:
            sleep(wait)
        _last_call[provider] = time.monotonic()


def _backoff(attempt_index: int, error: AIProviderError, has_next_model: bool) -> Optional[float]:
    """Seconds to wait before retrying the same model, or None to give up on it now."""
    if error.kind == "rate_limit":
        wait = error.retry_after if error.retry_after is not None else 20.0
        if has_next_model and wait > LONG_WAIT_SECONDS:
            return None
        return min(wait, 65.0)
    if error.kind == "overloaded":
        return min(5 * 3**attempt_index, 45)
    if error.kind in ("timeout", "network"):
        return min(2 ** (attempt_index + 1), 15)
    return 1.0  # invalid_output / unknown: retry quickly


def run_with_fallback(
    prompt: str,
    schema: Type[T],
    *,
    chain: Sequence[ModelRef],
    system: Optional[str] = None,
    temperature: float = 0.3,
    attempts_per_model: int = 2,
    single_model_attempts: int = 4,
    deadline_seconds: float = 240.0,
    timeout_seconds: float = 90.0,
    sleep: Optional[Callable[[float], None]] = None,
    clock: Optional[Callable[[], float]] = None,
) -> AIResult:
    sleep = sleep or time.sleep  # looked up at call time so tests can patch time.sleep
    clock = clock or time.monotonic
    unique: list[ModelRef] = []
    for ref in chain:
        if ref.key not in {u.key for u in unique}:
            unique.append(ref)

    deadline = clock() + deadline_seconds
    trail: list[Attempt] = []
    total_attempts = 0

    for index, ref in enumerate(unique):
        provider = get_provider(ref.provider)
        if not provider.is_configured():
            trail.append(Attempt(ref.provider, ref.model, "not_configured"))
            continue
        has_next = index < len(unique) - 1
        cap = attempts_per_model if len(unique) > 1 else max(attempts_per_model, single_model_attempts)

        for attempt_index in range(cap):
            if clock() >= deadline:
                trail.append(Attempt(ref.provider, ref.model, "deadline"))
                raise AllProvidersFailed(trail)
            _throttle(ref.provider, sleep)
            started = time.perf_counter()
            total_attempts += 1
            try:
                value = provider.generate_json(
                    model=ref.model, prompt=prompt, schema=schema, system=system,
                    temperature=temperature, timeout=min(timeout_seconds, max(5.0, deadline - clock())),
                )
            except AIProviderError as exc:
                trail.append(Attempt(ref.provider, ref.model, exc.kind, int((time.perf_counter() - started) * 1000)))
                logger.warning("AI attempt failed provider=%s model=%s kind=%s detail=%s", ref.provider, ref.model, exc.kind, exc.message)
                if not exc.retryable or attempt_index == cap - 1:
                    break
                wait = _backoff(attempt_index, exc, has_next)
                if wait is None or clock() + wait >= deadline:
                    break
                sleep(wait)
                continue
            trail.append(Attempt(ref.provider, ref.model, "ok", int((time.perf_counter() - started) * 1000)))
            return AIResult(value, ref.provider, ref.model, total_attempts, index > 0, trail)

    raise AllProvidersFailed(trail)


def test_model(ref: ModelRef, timeout_seconds: float = 20.0) -> dict:
    """One real call, no retries and no fallback: used by the 'Test connection' button."""

    class Pong(BaseModel):
        ok: bool

    provider = get_provider(ref.provider)
    if not provider.is_configured():
        return {"ok": False, "kind": "not_configured", "message": f"No API key is configured for {provider.label}."}
    started = time.perf_counter()
    try:
        provider.generate_json(model=ref.model, prompt="Return the JSON {\"ok\": true}.", schema=Pong,
                               system=None, temperature=0.0, timeout=timeout_seconds)
    except AIProviderError as exc:
        return {"ok": False, "kind": exc.kind, "message": exc.message}
    return {"ok": True, "latency_ms": int((time.perf_counter() - started) * 1000)}
