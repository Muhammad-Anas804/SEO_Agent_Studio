import json

import pytest
from test_pipeline_and_api import BODY, FREE, PRO, fake_llm

from seo_agents import llm
from seo_agents.analysis import analyze
from seo_agents.State import JSONLDSchema, SEOState

START = "/api/v1/generate-seo-campaign"


@pytest.fixture(autouse=True)
def patch_llm(monkeypatch):
    monkeypatch.setattr(llm, "generate_structured", fake_llm)


def good_state() -> SEOState:
    body = "# Best portfolio website tips\n" + "A portfolio website helps developers get hired. " * 8 + "\n"
    for i in range(4):
        body += f"\n## Section {i}\n" + "Show real projects and explain your role clearly. " * 20 + "\n"
    s = SEOState(run_id="1", target_keyword="portfolio website", word_count_target=600,
                 meta_title="Portfolio website guide for developers who want jobs",
                 meta_description="Learn how to build a portfolio website that shows real projects, explains your role clearly, and helps recruiters trust your work fast.",
                 generated_article_markdown=body)
    s.schema_markup = JSONLDSchema(json_ld_article="{}", json_ld_faq="{}")
    return s


def test_score_rewards_good_article_and_flags_bad():
    good = analyze(good_state())
    assert good.score >= 80
    bad_state = good_state()
    bad_state.meta_title = "Hi"
    bad_state.generated_article_markdown = "no headings and no keyword here"
    bad_state.schema_markup = None
    bad = analyze(bad_state)
    assert bad.score < 40
    assert any(not c.passed and "title" in c.name.lower() for c in bad.checks)


def test_run_includes_seo_report_and_options(client):
    r = client.post(START, headers=PRO, json={**BODY, "tone": "Friendly", "word_count_target": 800, "language": "Spanish"})
    assert r.status_code == 202
    data = client.get(f"/api/v1/runs/{r.json()['run_id']}", headers=PRO).json()["data"]
    assert data["tone"] == "friendly" and data["word_count_target"] == 800 and data["language"] == "Spanish"
    assert 0 <= data["seo_report"]["score"] <= 100 and data["seo_report"]["checks"]
    assert json.loads(data["schema_markup"]["json_ld_article"])["inLanguage"] == "es"


@pytest.mark.parametrize("extra", [{"tone": "angry"}, {"word_count_target": 50}, {"word_count_target": 99999}, {"language": "x<script>"}])
def test_option_validation(client, extra):
    assert client.post(START, headers=PRO, json={**BODY, **extra}).status_code == 422


def test_daily_quota_and_usage(client):
    for _ in range(3):
        assert client.post(START, headers=FREE, json=BODY).status_code == 202
    blocked = client.post(START, headers=FREE, json=BODY)
    assert blocked.status_code == 429 and "Daily limit" in blocked.json()["detail"]
    assert int(blocked.headers["Retry-After"]) > 0
    usage = client.get("/api/v1/usage", headers=FREE).json()
    assert usage["used_today"] == 3 and usage["daily_limit"] == 3 and usage["tier"] == "free"
    assert client.get("/api/v1/usage", headers=PRO).json()["used_today"] == 0  # quotas are per key


def test_export_formats_and_sanitizing(client, monkeypatch):
    def evil(prompt, schema, **kw):
        out = fake_llm(prompt, schema, **kw)
        if schema.__name__ == "ArticleOutput":
            out.markdown_body = "# Title\n\nHello <script>alert(1)</script> [x](javascript:alert(2)) world\n\n## A\ntext"
        return out
    monkeypatch.setattr(llm, "generate_structured", evil)
    rid = client.post(START, headers=PRO, json=BODY).json()["run_id"]

    html = client.get(f"/api/v1/runs/{rid}/export?format=html", headers=PRO)
    assert html.status_code == 200 and "attachment" in html.headers["content-disposition"]
    assert "alert(1)" not in html.text and "javascript:" not in html.text
    assert 'application/ld+json' in html.text and "<h1>Title</h1>" in html.text

    md = client.get(f"/api/v1/runs/{rid}/export?format=md", headers=PRO).text
    assert md.startswith("---\ntitle:")
    assert json.loads(client.get(f"/api/v1/runs/{rid}/export?format=json", headers=PRO).text)["run_id"] == rid
    assert client.get(f"/api/v1/runs/{rid}/export?format=pdf", headers=PRO).status_code == 422
    assert client.get(f"/api/v1/runs/{rid}/export?format=md", headers=FREE).status_code == 404  # not yours


def test_delete_run(client):
    rid = client.post(START, headers=PRO, json=BODY).json()["run_id"]
    assert client.delete(f"/api/v1/runs/{rid}", headers=FREE).status_code == 404
    assert client.delete(f"/api/v1/runs/{rid}", headers=PRO).status_code == 204
    assert client.get(f"/api/v1/runs/{rid}", headers=PRO).status_code == 404


def test_request_id_and_headers(client):
    r = client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert r.headers["x-request-id"] == "abc-123" and r.headers["x-content-type-options"] == "nosniff"
    assert client.get("/health", headers={"X-Request-ID": "bad id!!"}).headers["x-request-id"] != "bad id!!"
