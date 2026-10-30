"""API-key authentication (tier is decided server-side) and per-key rate limiting."""
from __future__ import annotations

import hashlib
import hmac
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, Header, HTTPException

from seo_agents.config import get_settings


@dataclass(frozen=True)
class Principal:
    owner_id: str
    tier: str
    is_admin: bool = False

    @property
    def is_pro(self) -> bool:
        return self.tier == "pro"


def _owner_id(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()[:16]


def get_principal(x_api_key: Optional[str] = Header(default=None)) -> Principal:
    settings = get_settings()
    if not settings.api_keys:  # local development only; production refuses to start like this
        tier = settings.dev_default_tier if settings.dev_default_tier in ("free", "pro") else "pro"
        return Principal(owner_id="anonymous-dev", tier=tier, is_admin=True)
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")
    for key, tier in settings.api_keys.items():
        if hmac.compare_digest(key.encode(), x_api_key.encode()):
            return Principal(owner_id=_owner_id(key), tier=tier, is_admin=key in settings.admin_keys)
    raise HTTPException(status_code=401, detail="Invalid API key")


class _RateLimiter:
    """Sliding window, in-process. Use Redis if you run more than one instance."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, owner: str, limit: int, window: float = 60.0) -> Optional[int]:
        now = time.monotonic()
        with self._lock:
            hits = self._hits[owner]
            while hits and now - hits[0] > window:
                hits.popleft()
            if len(hits) >= limit:
                return max(1, int(window - (now - hits[0])))
            hits.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


rate_limiter = _RateLimiter()


def rate_limited(principal: Principal = Depends(get_principal)) -> Principal:
    retry_after = rate_limiter.check(principal.owner_id, get_settings().rate_limit_per_minute)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after)},
        )
    return principal


def require_admin(principal: Principal = Depends(rate_limited)) -> Principal:
    """Global settings (AI models) can only be changed by keys listed in ADMIN_API_KEYS."""
    if not principal.is_admin:
        raise HTTPException(status_code=403, detail="An admin API key is required for this action")
    return principal
