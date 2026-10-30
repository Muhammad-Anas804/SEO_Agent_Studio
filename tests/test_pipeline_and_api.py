import json

import pytest

from seo_agents import llm
from seo_agents import seo_brain as brain
from seo_agents.State import SEOState

PRO = {"X-API-Key": "pro-key-0123456789abc"}
FREE = {"X-API-Key": "free-key-0123456789ab"}
BODY = {"target_keyword": "ai automation agency", "target_url": "https://example.com/blog/x"}


def fake_llm(prompt, schema, **_):
    if schema is brain.KeywordIntentOutput:
        return schema(search_intent="Informational", target_audience="Founders", lsi_keywords=["a", "b", "c", "d", "e"])
    if schema is brain.OutlineOutput:
        return schema(content_outline=["H1 Title", "H2 Intro"], content_gap_insights=["gap"])
    if schema is brain.ArticleOutput:
        return schema(meta_title="T" * 80, meta_description="D" * 200, markdown_body="# Title\n" + "word " * 700)
    if schema is brain.FAQOutput:
        return schema(faqs=[brain.FAQItem(question="Q?", answer="A.")])
    if schema is brain.InternalLinkOutput:
        return schema(links=[
            brain.InternalLinkItem(anchor_text="pricing", target_path="/pricing", context_sentence="See pricing."),
            brain.InternalLinkItem(anchor_text="fake", target_path="/hallucinated", context_sentence="x"),
        ])
    raise AssertionError(schema)


@pytest.fixture(autouse=True)
def patch_llm(monkeypatch):
    monkeypatch.setattr(llm, "generate_structured", fake_llm)


def test_requires_api_key(client):
    assert client.post("/api/v1/generate-seo-campaign", json=BODY).status_code == 401
    assert client.get("/api/v1/me", headers={"X-API-Key": "wrong-key-wrong-key-1"}).status_code == 401


def test_tier_comes_from_key_not_client(client):
    assert client.get("/api/v1/me", headers=FREE).json() == {"tier": "free"}
    assert client.get("/api/v1/me", headers=PRO).json() == {"tier": "pro"}


def test_full_run_pro_validates_outputs(client):
    r = client.post("/api/v1/generate-seo-campaign", headers=PRO, json={**BODY, "site_paths": ["/pricing", "/about"]})
    assert r.status_code == 202
    run = client.get(f"/api/v1/runs/{r.json()['run_id']}", headers=PRO).json()
    assert run["status"] == "completed"
    data = run["data"]
    assert len(data["meta_title"]) <= 60 and len(data["meta_description"]) <= 160
    assert [l["target_path"] for l in data["internal_links"]] == ["/pricing"]  # hallucinated path dropped
    assert json.loads(data["schema_markup"]["json_ld_article"])["@type"] == "Article"
    assert json.loads(data["schema_markup"]["json_ld_faq"])["@type"] == "FAQPage"
    assert data["ready_for_cms_publish"] is True


def test_free_tier_skips_links(client):
    r = client.post("/api/v1/generate-seo-campaign", headers=FREE, json={**BODY, "site_paths": ["/pricing"]})
    data = client.get(f"/api/v1/runs/{r.json()['run_id']}", headers=FREE).json()["data"]
    assert data["internal_links"] == []
    assert any(a["status"] == "SKIPPED" for a in data["audit_trail"])


def test_runs_are_private_per_key(client):
    rid = client.post("/api/v1/generate-seo-campaign", headers=PRO, json=BODY).json()["run_id"]
    assert client.get(f"/api/v1/runs/{rid}", headers=FREE).status_code == 404
    assert client.get("/api/v1/runs", headers=FREE).json() == []
    assert len(client.get("/api/v1/runs", headers=PRO).json()) == 1


@pytest.mark.parametrize("payload", [
    {"target_keyword": "x"},
    {"target_keyword": "ok keyword", "target_url": "javascript:alert(1)"},
    {"target_keyword": "ok keyword", "site_paths": ["no-leading-slash"]},
])
def test_input_validation(client, payload):
    assert client.post("/api/v1/generate-seo-campaign", headers=PRO, json=payload).status_code == 422


def test_rate_limit(client):
    codes = [client.post("/api/v1/generate-seo-campaign", headers=PRO, json=BODY).status_code for _ in range(7)]
    assert codes[:5] == [202] * 5 and codes[5] == 429


def test_critical_failure_stops_pipeline(client, monkeypatch):
    def boom(prompt, schema, **_):
        raise llm.LLMError("quota exceeded")
    monkeypatch.setattr(llm, "generate_structured", boom)
    rid = client.post("/api/v1/generate-seo-campaign", headers=PRO, json=BODY).json()["run_id"]
    run = client.get(f"/api/v1/runs/{rid}", headers=PRO).json()
    assert run["status"] == "failed"
    assert len(run["data"]["audit_trail"]) == 1 and run["data"]["errors"]


def test_state_sanitizes_keyword():
    s = SEOState(run_id="1", target_keyword="  best\n\tseo   tools \x00 ")
    assert s.target_keyword == "best seo tools"


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
