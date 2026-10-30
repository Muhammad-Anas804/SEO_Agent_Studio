import json

import httpx
import pytest

from seo_agents import llm, serp
from seo_agents.config import get_settings
from test_pipeline_and_api import BODY, FREE, PRO, fake_llm

START = "/api/v1/generate-seo-campaign"
SAMPLE = {
    "organic": [
        {"position": 1, "title": "Best Portfolio Websites", "link": "https://a.com/x", "snippet": "Great list"},
        {"position": 2, "title": "Evil", "link": "javascript:alert(1)", "snippet": "x"},
        {"position": 3, "title": "Dup", "link": "https://a.com/x", "snippet": "dup"},
    ],
    "peopleAlsoAsk": [{"question": "What makes a good portfolio?", "snippet": "Real projects."}],
    "relatedSearches": [{"query": "portfolio examples"}],
}


@pytest.fixture
def spy_llm(monkeypatch):
    seen = []

    def spy(prompt, schema, **kw):
        seen.append((schema.__name__, prompt))
        return fake_llm(prompt, schema, **kw)

    monkeypatch.setattr(llm, "generate_structured", spy)
    return seen


@pytest.fixture
def serp_settings(monkeypatch):
    monkeypatch.setenv("SERPER_API_KEY", "key-123")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_normalize_filters_unsafe_and_duplicate_results():
    data = serp.normalize(SAMPLE)
    assert [r.url for r in data.results] == ["https://a.com/x"]
    assert data.people_also_ask[0].question == "What makes a good portfolio?"
    assert data.related_searches == ["portfolio examples"]


def test_fetch_sends_expected_request(serp_settings):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["key"] = request.headers["x-api-key"]
        captured["body"] = json.loads(request.read())
        return httpx.Response(200, json=SAMPLE)

    data = serp.fetch_serp("my keyword", "es", transport=httpx.MockTransport(handler))
    assert captured["key"] == "key-123"
    assert captured["body"]["q"] == "my keyword" and captured["body"]["hl"] == "es"
    assert len(data.results) == 1


@pytest.mark.parametrize("status,text", [(403, "rejected"), (429, "rate limit")])
def test_fetch_maps_errors(serp_settings, status, text):
    transport = httpx.MockTransport(lambda r: httpx.Response(status, json={}))
    with pytest.raises(serp.SerpError, match=text):
        serp.fetch_serp("kw", transport=transport)


@pytest.mark.serp_key("test-serp-key")
def test_pro_run_uses_real_serp_data_and_caches(client, monkeypatch, spy_llm):
    calls = []

    def fake_fetch(keyword, language_code="en", transport=None):
        calls.append(keyword)
        return serp.normalize(SAMPLE)

    monkeypatch.setattr(serp, "fetch_serp", fake_fetch)
    rid = client.post(START, headers=PRO, json=BODY).json()["run_id"]
    data = client.get(f"/api/v1/runs/{rid}", headers=PRO).json()["data"]
    assert data["serp"]["results"][0]["title"] == "Best Portfolio Websites"
    outline = next(p for n, p in spy_llm if n == "OutlineOutput")
    assert "Best Portfolio Websites" in outline and "What makes a good portfolio?" in outline
    faq = next(p for n, p in spy_llm if n == "FAQOutput")
    assert "What makes a good portfolio?" in faq

    rid2 = client.post(START, headers=PRO, json=BODY).json()["run_id"]
    again = client.get(f"/api/v1/runs/{rid2}", headers=PRO).json()["data"]
    assert len(calls) == 1 and again["serp"]["cached"] is True


@pytest.mark.serp_key("test-serp-key")
def test_free_tier_skips_research(client, monkeypatch, spy_llm):
    monkeypatch.setattr(serp, "fetch_serp", lambda *a, **k: pytest.fail("must not be called"))
    rid = client.post(START, headers=FREE, json=BODY).json()["run_id"]
    data = client.get(f"/api/v1/runs/{rid}", headers=FREE).json()["data"]
    assert data["serp"] is None
    assert any(a["agent_name"] == "SERPResearchAgent" and a["status"] == "SKIPPED" for a in data["audit_trail"])


def test_no_key_means_skipped_not_failed(client, spy_llm):
    rid = client.post(START, headers=PRO, json=BODY).json()["run_id"]
    run = client.get(f"/api/v1/runs/{rid}", headers=PRO).json()
    assert run["status"] == "completed" and run["data"]["serp"] is None


@pytest.mark.serp_key("test-serp-key")
def test_serp_failure_is_a_warning_not_a_failed_run(client, monkeypatch, spy_llm):
    def boom(*a, **k):
        raise serp.SerpError("out of credits")

    monkeypatch.setattr(serp, "fetch_serp", boom)
    rid = client.post(START, headers=PRO, json=BODY).json()["run_id"]
    run = client.get(f"/api/v1/runs/{rid}", headers=PRO).json()
    assert run["status"] == "completed" and not run["data"]["errors"]
    assert any("Competitor research unavailable" in w for w in run["data"]["warnings"])
