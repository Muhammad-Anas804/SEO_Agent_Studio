import importlib
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    """Tests must not depend on the developer's own .env (throttling, model chain, provider keys)."""
    for name, value in {
        "LLM_MIN_INTERVAL_SECONDS": "0", "LLM_FALLBACK_MODEL": "", "AI_PRIMARY": "", "AI_FALLBACKS": "",
        "GROQ_API_KEY": "", "OPENAI_API_KEY": "", "ANTHROPIC_API_KEY": "", "SERPER_API_KEY": "",
        "IMAGE_PROVIDER": "", "IMAGE_MODEL": "", "IMAGE_QUALITY": "medium", "CLOUDFLARE_API_TOKEN": "", "CLOUDFLARE_ACCOUNT_ID": "",
    }.items():
        monkeypatch.setenv(name, value)


@pytest.fixture
def client(tmp_path, monkeypatch, request):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("API_KEYS", "pro-key-0123456789abc:pro,free-key-0123456789ab:free")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "5")
    monkeypatch.setenv("FREE_DAILY_RUNS", "3")
    monkeypatch.setenv("PRO_DAILY_RUNS", "50")
    monkeypatch.setenv("ADMIN_API_KEYS", "pro-key-0123456789abc")
    monkeypatch.setenv("ENVIRONMENT", "development")
    marker = request.node.get_closest_marker("serp_key")
    monkeypatch.setenv("SERPER_API_KEY", marker.args[0] if marker else "")

    from seo_agents import config

    config.get_settings.cache_clear()
    import seo_agents.security as security
    import seo_agents.api as api

    importlib.reload(security)
    importlib.reload(api)

    from fastapi.testclient import TestClient

    with TestClient(api.app) as c:
        yield c
    config.get_settings.cache_clear()
