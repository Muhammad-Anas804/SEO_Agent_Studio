import json

import httpx
import pytest
from pydantic import BaseModel

from seo_agents.ai import base, fallback
from seo_agents.ai.ai_config import AIConfig, ModelRef, effective_chain
from seo_agents.ai.base import AIProviderError, Provider, clean_message, error_from_http, parse_json_output
from seo_agents.ai.fallback import AllProvidersFailed, run_with_fallback
from seo_agents.ai.registry import get_provider
from seo_agents.config import get_settings
from test_pipeline_and_api import BODY, FREE, PRO, fake_llm


class Out(BaseModel):
    value: str


class Fake(Provider):
    def __init__(self, name, outcomes, configured=True):
        self.name, self.label, self.outcomes, self.configured, self.calls = name, name, list(outcomes), configured, []

    def is_configured(self):
        return self.configured

    def generate_json(self, *, model, prompt, schema, system, temperature, timeout):
        self.calls.append(model)
        outcome = self.outcomes.pop(0) if self.outcomes else self.outcomes_default()
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    def outcomes_default(self):
        return Out(value="default")


def err(provider, kind, retry_after=None):
    return AIProviderError(provider, "m", kind, f"{kind} happened", retry_after)


@pytest.fixture
def providers(monkeypatch):
    registry = {}
    monkeypatch.setattr(fallback, "get_provider", lambda name: registry[name])
    return registry


def run(chain, **kw):
    sleeps = []
    kw.setdefault("sleep", sleeps.append)
    result = run_with_fallback("p", Out, chain=[ModelRef(provider=p, model=m) for p, m in chain], **kw)
    return result, sleeps


def test_primary_success(providers):
    providers["gemini"] = Fake("gemini", [Out(value="ok")])
    result, sleeps = run([("gemini", "a")])
    assert (result.provider, result.attempts, result.fallback_used) == ("gemini", 1, False) and not sleeps


def test_timeout_then_fallback_succeeds(providers):
    providers["gemini"] = Fake("gemini", [err("gemini", "timeout"), err("gemini", "timeout")])
    providers["groq"] = Fake("groq", [Out(value="ok")])
    result, _ = run([("gemini", "a"), ("groq", "b")])
    assert result.provider == "groq" and result.fallback_used and result.attempts == 3
    assert providers["gemini"].calls == ["a", "a"]  # bounded: two attempts, then move on


def test_long_rate_limit_switches_immediately_instead_of_waiting(providers):
    providers["gemini"] = Fake("gemini", [err("gemini", "rate_limit", retry_after=55)])
    providers["groq"] = Fake("groq", [Out(value="ok")])
    result, sleeps = run([("gemini", "a"), ("groq", "b")])
    assert result.provider == "groq" and not sleeps and len(providers["gemini"].calls) == 1


def test_short_rate_limit_is_waited_out_once(providers):
    providers["gemini"] = Fake("gemini", [err("gemini", "rate_limit", retry_after=4), Out(value="ok")])
    providers["groq"] = Fake("groq", [])
    result, sleeps = run([("gemini", "a"), ("groq", "b")])
    assert result.provider == "gemini" and sleeps == [4]


def test_invalid_credentials_are_not_retried_and_fall_through(providers):
    providers["gemini"] = Fake("gemini", [err("gemini", "auth")])
    providers["openai"] = Fake("openai", [Out(value="ok")])
    result, sleeps = run([("gemini", "a"), ("openai", "b")])
    assert result.provider == "openai" and len(providers["gemini"].calls) == 1 and not sleeps


def test_all_providers_fail_gives_safe_message(providers):
    providers["gemini"] = Fake("gemini", [err("gemini", "auth")])
    providers["groq"] = Fake("groq", [err("groq", "invalid_model")])
    with pytest.raises(AllProvidersFailed) as info:
        run([("gemini", "a"), ("groq", "b")])
    text = str(info.value)
    assert "All configured AI models failed" in text and "gemini/a: auth" in text and "groq/b: invalid_model" in text
    assert len(info.value.trail) == 2


def test_single_model_gets_more_attempts_but_stays_bounded(providers):
    providers["gemini"] = Fake("gemini", [err("gemini", "overloaded") for _ in range(10)])
    with pytest.raises(AllProvidersFailed):
        _, sleeps = run([("gemini", "a")])
    assert len(providers["gemini"].calls) == 4


def test_duplicate_models_are_called_once(providers):
    providers["gemini"] = Fake("gemini", [err("gemini", "auth")])
    providers["groq"] = Fake("groq", [Out(value="ok")])
    run([("gemini", "a"), ("gemini", "a"), ("groq", "b")])
    assert providers["gemini"].calls == ["a"]
    cfg = AIConfig(primary=ModelRef(provider="gemini", model="a"), fallbacks=[ModelRef(provider="gemini", model="a"), ModelRef(provider="groq", model="b")])
    assert [r.key for r in effective_chain(cfg)] == [("gemini", "a"), ("groq", "b")]
    cfg.fallback_enabled = False
    assert [r.key for r in effective_chain(cfg)] == [("gemini", "a")]


def test_unconfigured_provider_is_skipped(providers):
    providers["gemini"] = Fake("gemini", [], configured=False)
    providers["groq"] = Fake("groq", [Out(value="ok")])
    result, _ = run([("gemini", "a"), ("groq", "b")])
    assert result.provider == "groq" and not providers["gemini"].calls
    assert result.trail[0].outcome == "not_configured"


def test_overall_deadline_stops_the_chain(providers):
    providers["gemini"] = Fake("gemini", [err("gemini", "timeout") for _ in range(5)])
    ticks = iter([0, 0, 5, 5, 999, 999, 999, 999])
    with pytest.raises(AllProvidersFailed) as info:
        run([("gemini", "a"), ("groq", "b")], deadline_seconds=100, clock=lambda: next(ticks))
    assert any(a.outcome == "deadline" for a in info.value.trail)


def test_output_schema_validation():
    assert parse_json_output('```json\n{"value": "x"}\n```', Out, "p", "m").value == "x"
    assert parse_json_output('Sure! {"value": "x"} done', Out, "p", "m").value == "x"
    for bad in ("no json here", '{"wrong": 1}', "{broken"):
        with pytest.raises(AIProviderError) as info:
            parse_json_output(bad, Out, "p", "m")
        assert info.value.kind == "invalid_output" and info.value.retryable


def test_error_classification_and_redaction():
    assert error_from_http("p", "m", 401, "x").kind == "auth" and not error_from_http("p", "m", 401, "x").retryable
    assert error_from_http("p", "m", 404, "x").kind == "invalid_model"
    assert error_from_http("p", "m", 400, "The model `foo` does not exist").kind == "invalid_model"
    assert error_from_http("p", "m", 400, "bad param").kind == "bad_request"
    assert error_from_http("p", "m", 503, "x").kind == "overloaded"
    quota = error_from_http("p", "m", 429, "insufficient_quota")
    assert quota.kind == "quota_exhausted" and not quota.retryable
    limited = error_from_http("p", "m", 429, "slow down", "7")
    assert limited.kind == "rate_limit" and limited.retry_after == 7.0
    assert error_from_http("p", "m", 429, "PerDay quota").kind == "quota_exhausted"
    cleaned = clean_message("failed with api_key=sk-abcdefghijklmnop1234 and AIzaSyA1234567890abcdefghijk")
    assert "sk-abcdef" not in cleaned and "AIzaSyA" not in cleaned


@pytest.fixture
def keys(monkeypatch):
    for name in ("GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.setenv(name, "secret-key-value-123456")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def mock_transport(handler, monkeypatch):
    monkeypatch.setattr(base, "HTTP_TRANSPORT", httpx.MockTransport(handler))


def test_openai_adapter_request_and_parsing(keys, monkeypatch):
    seen = {}

    def handler(request):
        seen["auth"], seen["body"] = request.headers["authorization"], json.loads(request.read())
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"value": "hi"}'}}]})

    mock_transport(handler, monkeypatch)
    out = get_provider("openai").generate_json(model="gpt-5.4-nano", prompt="p", schema=Out, system="sys", temperature=0.3, timeout=5)
    assert out.value == "hi" and seen["auth"] == "Bearer secret-key-value-123456"
    assert seen["body"]["response_format"] == {"type": "json_object"} and "temperature" not in seen["body"]
    assert seen["body"]["messages"][0] == {"role": "system", "content": "sys"}

    get_provider("groq").generate_json(model="openai/gpt-oss-20b", prompt="p", schema=Out, system=None, temperature=0.3, timeout=5)
    assert seen["body"]["temperature"] == 0.3  # normal models keep temperature


@pytest.mark.parametrize("status,headers,kind", [(401, {}, "auth"), (404, {}, "invalid_model"), (429, {"retry-after": "9"}, "rate_limit"), (503, {}, "overloaded")])
def test_openai_adapter_maps_http_errors(keys, monkeypatch, status, headers, kind):
    mock_transport(lambda r: httpx.Response(status, headers=headers, json={"error": "x"}), monkeypatch)
    with pytest.raises(AIProviderError) as info:
        get_provider("groq").generate_json(model="m", prompt="p", schema=Out, system=None, temperature=0, timeout=5)
    assert info.value.kind == kind and "secret-key" not in str(info.value)


def test_adapter_maps_timeout_and_garbage_output(keys, monkeypatch):
    def boom(request):
        raise httpx.ReadTimeout("slow")

    mock_transport(boom, monkeypatch)
    with pytest.raises(AIProviderError) as info:
        get_provider("openai").generate_json(model="m", prompt="p", schema=Out, system=None, temperature=0, timeout=5)
    assert info.value.kind == "timeout"

    mock_transport(lambda r: httpx.Response(200, json={"choices": [{"message": {"content": "not json"}}]}), monkeypatch)
    with pytest.raises(AIProviderError) as info:
        get_provider("openai").generate_json(model="m", prompt="p", schema=Out, system=None, temperature=0, timeout=5)
    assert info.value.kind == "invalid_output"


def test_anthropic_adapter(keys, monkeypatch):
    seen = {}

    def handler(request):
        seen["headers"], seen["body"] = request.headers, json.loads(request.read())
        return httpx.Response(200, json={"content": [{"type": "text", "text": '{"value": "claude"}'}]})

    mock_transport(handler, monkeypatch)
    out = get_provider("anthropic").generate_json(model="claude-haiku-5-5", prompt="p", schema=Out, system="sys", temperature=0.2, timeout=5)
    assert out.value == "claude" and seen["headers"]["x-api-key"] == "secret-key-value-123456"
    assert seen["headers"]["anthropic-version"] and seen["body"]["system"] == "sys" and seen["body"]["max_tokens"] > 0


def test_missing_keys_report_not_configured(monkeypatch):
    for name in ("GROQ_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.setenv(name, "")
    get_settings.cache_clear()
    try:
        assert not any(get_provider(n).is_configured() for n in ("groq", "openai", "anthropic"))
        assert fallback.test_model(ModelRef(provider="groq", model="m"))["kind"] == "not_configured"
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------- API
ADMIN = PRO
NEW = {"primary": {"provider": "groq", "model": "openai/gpt-oss-20b"},
       "fallbacks": [{"provider": "gemini", "model": "gemini-2.5-flash"}], "fallback_enabled": True}


def test_settings_endpoints_authorization_and_persistence(client):
    assert client.get("/api/v1/ai/settings").status_code == 401
    view = client.get("/api/v1/ai/settings", headers=FREE).json()
    assert view["can_edit"] is False and view["source"] == "environment"
    assert {p["name"] for p in view["providers"]} == {"gemini", "groq", "openai", "anthropic"}
    assert "key" not in json.dumps(view).lower().replace("keys", "")  # no secrets in the payload

    assert client.put("/api/v1/ai/settings", headers=FREE, json=NEW).status_code == 403
    assert client.put("/api/v1/ai/settings", json=NEW).status_code == 401
    saved = client.put("/api/v1/ai/settings", headers=ADMIN, json=NEW)
    assert saved.status_code == 200 and saved.json()["config"]["primary"]["provider"] == "groq"
    again = client.get("/api/v1/ai/settings", headers=FREE).json()
    assert again["source"] == "database" and again["config"]["fallbacks"][0]["model"] == "gemini-2.5-flash"


@pytest.mark.parametrize("bad", [
    {**NEW, "primary": {"provider": "nope", "model": "x"}},
    {**NEW, "primary": {"provider": "groq", "model": "bad model!"}},
    {**NEW, "fallbacks": [NEW["primary"]] * 5},
])
def test_settings_validation(client, bad):
    assert client.put("/api/v1/ai/settings", headers=ADMIN, json=bad).status_code == 422


def test_connection_test_endpoint(client, monkeypatch):
    monkeypatch.setattr(fallback, "get_provider", lambda name: Fake(name, [Out(value="x")]))
    assert client.post("/api/v1/ai/test", headers=FREE, json=NEW["primary"]).status_code == 403
    ok = client.post("/api/v1/ai/test", headers=ADMIN, json=NEW["primary"]).json()
    assert ok["ok"] is True and "latency_ms" in ok
    monkeypatch.setattr(fallback, "get_provider", lambda name: Fake(name, [err(name, "auth")]))
    bad = client.post("/api/v1/ai/test", headers=ADMIN, json=NEW["primary"]).json()
    assert bad == {"ok": False, "kind": "auth", "message": bad["message"]}


def test_pipeline_uses_fallback_and_reports_it(client, monkeypatch):
    """End to end through the real chain: primary overloaded, fallback answers every step, user is told."""
    class Answers(Fake):
        def generate_json(self, *, model, prompt, schema, system, temperature, timeout):
            self.calls.append(model)
            return fake_llm(prompt, schema)

    broken = Fake("gemini", [err("gemini", "overloaded") for _ in range(50)])
    good = Answers("groq", [])
    monkeypatch.setattr(fallback, "get_provider", lambda name: {"gemini": broken, "groq": good}[name])
    monkeypatch.setattr(fallback.time, "sleep", lambda s: None)
    config = {"primary": {"provider": "gemini", "model": "gemini-2.5-flash"},
              "fallbacks": [{"provider": "groq", "model": "openai/gpt-oss-20b"}], "fallback_enabled": True}
    assert client.put("/api/v1/ai/settings", headers=ADMIN, json=config).status_code == 200
    rid = client.post("/api/v1/generate-seo-campaign", headers=ADMIN, json=BODY).json()["run_id"]
    run = client.get(f"/api/v1/runs/{rid}", headers=ADMIN).json()
    data = run["data"]
    assert run["status"] == "completed" and data["generated_article_markdown"]
    assert data["ai_usage"] and all(u["provider"] == "groq" and u["fallback_used"] for u in data["ai_usage"])
    assert any("primary AI model failed" in w for w in data["warnings"])


def test_pipeline_when_every_model_fails_returns_clear_failure_without_fake_content(client, monkeypatch):
    monkeypatch.setattr(fallback, "get_provider", lambda name: Fake(name, [err(name, "auth") for _ in range(9)]))
    rid = client.post("/api/v1/generate-seo-campaign", headers=ADMIN, json=BODY).json()["run_id"]
    run = client.get(f"/api/v1/runs/{rid}", headers=ADMIN).json()
    assert run["status"] == "failed" and not run["data"]["generated_article_markdown"]
    assert "All configured AI models failed" in run["data"]["errors"][0]
