"""Central configuration, read from environment variables (.env supported)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

VALID_TIERS = {"free", "pro"}


def _csv(name: str, default: str = "") -> list[str]:
    return [p.strip() for p in os.getenv(name, default).split(",") if p.strip()]


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def _parse_api_keys(raw: str) -> dict[str, str]:
    """API_KEYS="key1:pro,key2:free" -> {"key1": "pro", "key2": "free"}"""
    keys: dict[str, str] = {}
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        key, _, tier = item.partition(":")
        tier = (tier or "free").strip().lower()
        if tier not in VALID_TIERS:
            raise RuntimeError(f"API_KEYS: unknown tier '{tier}' (use free or pro)")
        if len(key) < 16:
            raise RuntimeError("API_KEYS: each key must be at least 16 characters")
        keys[key.strip()] = tier
    return keys


@dataclass(frozen=True)
class Settings:
    environment: str
    gemini_api_key: str
    model_id: str
    allowed_origins: list[str]
    api_keys: dict[str, str]
    dev_default_tier: str
    database_path: str
    rate_limit_per_minute: int
    max_concurrent_runs: int
    free_daily_runs: int
    pro_daily_runs: int
    serper_api_key: str
    groq_api_key: str
    openai_api_key: str
    anthropic_api_key: str
    ai_primary: str
    ai_fallbacks: str
    ai_deadline_seconds: int
    admin_keys: frozenset[str]
    chroma_path: str
    kb_max_pages: int
    image_provider: str
    image_model: str
    image_quality: str
    image_dir: str
    cloudflare_api_token: str
    cloudflare_account_id: str
    serp_country: str
    serp_cache_hours: int
    llm_max_retries: int
    llm_timeout_seconds: int
    log_level: str

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def validate(self) -> None:
        """Fail fast on unsafe production configuration."""
        if self.is_production:
            if not self.gemini_api_key:
                raise RuntimeError("GEMINI_API_KEY is required in production")
            if not self.api_keys:
                raise RuntimeError("API_KEYS is required in production (format: key:tier,key:tier)")
            if "*" in self.allowed_origins:
                raise RuntimeError("ALLOWED_ORIGINS must list explicit origins in production")


@lru_cache
def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("ENVIRONMENT", "development").lower(),
        gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
        model_id=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        allowed_origins=_csv("ALLOWED_ORIGINS", "http://localhost:3000"),
        api_keys=_parse_api_keys(os.getenv("API_KEYS", "")),
        dev_default_tier=os.getenv("DEV_DEFAULT_TIER", "pro").lower(),
        database_path=os.getenv("DATABASE_PATH", "./data/seo_agent.db"),
        rate_limit_per_minute=_int("RATE_LIMIT_PER_MINUTE", 10),
        max_concurrent_runs=_int("MAX_CONCURRENT_RUNS", 3),
        free_daily_runs=_int("FREE_DAILY_RUNS", 5),
        pro_daily_runs=_int("PRO_DAILY_RUNS", 100),
        serper_api_key=os.getenv("SERPER_API_KEY", ""),
        groq_api_key=os.getenv("GROQ_API_KEY", ""),
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        ai_primary=os.getenv("AI_PRIMARY", "").strip(),
        ai_fallbacks=os.getenv("AI_FALLBACKS", "").strip(),
        ai_deadline_seconds=_int("AI_DEADLINE_SECONDS", 240),
        admin_keys=frozenset(_csv("ADMIN_API_KEYS")),
        chroma_path=os.getenv("CHROMA_PATH", "./data/chroma"),
        kb_max_pages=_int("KB_MAX_PAGES", 500),
        image_provider=os.getenv("IMAGE_PROVIDER", "").strip().lower(),
        image_model=os.getenv("IMAGE_MODEL", "").strip(),
        image_quality=os.getenv("IMAGE_QUALITY", "medium").strip().lower() or "medium",
        image_dir=os.getenv("IMAGE_DIR", "./data/images"),
        cloudflare_api_token=os.getenv("CLOUDFLARE_API_TOKEN", ""),
        cloudflare_account_id=os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip(),
        serp_country=os.getenv("SERP_COUNTRY", "us").lower(),
        serp_cache_hours=_int("SERP_CACHE_HOURS", 24),
        llm_max_retries=_int("LLM_MAX_RETRIES", 3),
        llm_timeout_seconds=_int("LLM_TIMEOUT_SECONDS", 90),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )
