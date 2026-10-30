import math
import re
import zlib

import pytest
from langchain_core.embeddings import Embeddings

from seo_agents import llm
from seo_agents.config import get_settings
from seo_agents.kb import cli, embeddings, linking, store
from test_pipeline_and_api import BODY, FREE, PRO, fake_llm

START = "/api/v1/generate-seo-campaign"
PORTFOLIO = (
    "A developer portfolio website shows real projects, "
    "a clear about page and a contact form so recruiters can hire you."
)
COOKING = (
    "Boil the pasta in salted water, then toss it with tomato sauce, "
    "basil and olive oil for a simple dinner."
)
PRICING = (
    "Our pricing plans include a free tier and a pro tier billed monthly "
    "with email support."
)

class WordEmbeddings(Embeddings):
    """Deterministic bag-of-words vectors: similar wording means similar vectors (no model download)."""

    DIM = 128

    def _vec(self, text):
        v = [0.0] * self.DIM
        for word in re.findall(r"[a-z]{3,}", text.lower()):
            v[zlib.crc32(word.encode()) % self.DIM] += 1
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    def embed_documents(self, texts):
        return [self._vec(t) for t in texts]

    def embed_query(self, text):
        return self._vec(text)


@pytest.fixture
def kb_env(tmp_path, monkeypatch):
    monkeypatch.setenv("CHROMA_PATH", str(tmp_path / "chroma"))
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "kb.db"))
    get_settings.cache_clear()
    embeddings._override = WordEmbeddings()
    yield
    embeddings._override = None
    get_settings.cache_clear()


def fill(owner="alice"):
    store.upsert_page(owner, "/blog/portfolio", "Portfolio guide", PORTFOLIO)
    store.upsert_page(owner, "/blog/pasta", "Pasta dinner", COOKING)
    store.upsert_page(owner, "/pricing", "Pricing", PRICING)


def test_search_ranks_the_relevant_page_first(kb_env):
    fill()
    hits = store.search("alice", "how to build a developer portfolio website for recruiters")
    assert hits[0]["path"] == "/blog/portfolio" and hits[0]["score"] > hits[-1]["score"]
    assert {h["path"] for h in hits} == {"/blog/portfolio", "/blog/pasta", "/pricing"}


def test_reindexing_replaces_old_content(kb_env):
    store.upsert_page("alice", "/blog/x", "X", "old zebra content about animals and savannas")
    store.upsert_page("alice", "/blog/x", "X v2", "new content about quantum computing hardware")
    pages = store.list_pages("alice")
    assert len(pages) == 1 and pages[0]["title"] == "X v2" and pages[0]["chunks"] == 1
    assert store.search("alice", "zebra savannas", k=1)[0]["snippet"].startswith("X v2")


def test_owners_are_isolated_and_delete_works(kb_env):
    fill("alice")
    store.upsert_page("bob", "/blog/bob", "Bob", "bob writes about gardens and roses")
    assert {p["path"] for p in store.list_pages("bob")} == {"/blog/bob"}
    assert store.search("bob", "portfolio website")[0]["path"] == "/blog/bob"
    assert store.delete_page("alice", "/pricing") is True and store.delete_page("alice", "/pricing") is False
    assert store.count_pages("alice") == 2 and store.search("nobody", "anything") == []


def test_validation_and_page_limit(kb_env, monkeypatch):
    for bad in ("no-slash", "/" + "x" * 300, "/bad\npath"):
        with pytest.raises(store.KBError):
            store.upsert_page("alice", bad, "t", "content")
    with pytest.raises(store.KBError):
        store.upsert_page("alice", "/a", "t", "   ")
    monkeypatch.setenv("KB_MAX_PAGES", "2")
    get_settings.cache_clear()
    store.upsert_page("alice", "/a", "A", "alpha text here")
    store.upsert_page("alice", "/b", "B", "beta text here")
    with pytest.raises(store.KBError, match="limit"):
        store.upsert_page("alice", "/c", "C", "gamma text here")
    store.upsert_page("alice", "/a", "A2", "updating an existing page is still allowed")


def test_graph_chooses_only_retrieved_pages_and_skips_when_empty(kb_env, monkeypatch):
    def pick(prompt, schema, **kw):
        return schema(links=[linking.LinkItem(anchor_text="portfolio guide", target_path="/blog/portfolio", context_sentence="See it."),
                             linking.LinkItem(anchor_text="ghost", target_path="/never-indexed", context_sentence="x")])

    monkeypatch.setattr(llm, "generate_structured", pick)
    fill()
    result = linking.run("alice", "developer portfolio website", PORTFOLIO)
    assert [s["target_path"] for s in result["suggestions"]] == ["/blog/portfolio"]
    assert "1 suggestion(s) discarded" in result["note"]

    monkeypatch.setattr(llm, "generate_structured", lambda *a, **k: pytest.fail("no pages: the model must not be called"))
    empty = linking.run("carol", "anything", "text")
    assert empty["suggestions"] == [] and "no pages relevant" in empty["note"]


def test_cli_indexes_markdown_and_mdx(kb_env, tmp_path):
    folder = tmp_path / "blog"
    folder.mkdir()
    (folder / "first-post.mdx").write_text('---\ntitle: "My First Post"\ndate: 2026-01-01\n---\nBody about portfolio websites.', encoding="utf-8")
    (folder / "second.md").write_text("# Second Heading\n\nBody about pasta dinners.", encoding="utf-8")
    assert cli.main(["--dir", str(folder), "--prefix", "blog"]) == 0
    titles = {p["path"]: p["title"] for p in store.list_pages("anonymous-dev")}
    assert titles == {"/blog/first-post": "My First Post", "/blog/second": "Second Heading"}
    assert cli.main(["--dir", str(tmp_path / "missing")]) == 1


def test_kb_api_authorization_validation_and_crud(kb_env, client):
    page = {"path": "/blog/portfolio", "title": "Portfolio guide", "content": PORTFOLIO}
    assert client.post("/api/v1/kb/pages", json=page).status_code == 401
    assert client.post("/api/v1/kb/pages", headers=FREE, json=page).status_code == 403
    assert client.post("/api/v1/kb/pages", headers=PRO, json={**page, "path": "nope"}).status_code == 422
    assert client.post("/api/v1/kb/pages", headers=PRO, json=page).json() == {"path": "/blog/portfolio", "chunks": 1}
    listing = client.get("/api/v1/kb/pages", headers=PRO).json()
    assert [p["path"] for p in listing["pages"]] == ["/blog/portfolio"] and listing["limit"] == 500
    assert client.get("/api/v1/kb/pages", headers=FREE).json()["pages"] == []  # private per key
    assert client.delete("/api/v1/kb/pages", params={"path": "/blog/portfolio"}, headers=FREE).status_code == 404
    assert client.delete("/api/v1/kb/pages", params={"path": "/blog/portfolio"}, headers=PRO).status_code == 204
    assert client.get("/api/v1/kb/pages", headers=PRO).json()["pages"] == []


def test_pipeline_links_come_from_the_knowledge_base(kb_env, client, monkeypatch):
    for path, title, text in (("/blog/portfolio", "Portfolio guide", PORTFOLIO), ("/blog/pasta", "Pasta dinner", COOKING)):
        assert client.post("/api/v1/kb/pages", headers=PRO, json={"path": path, "title": title, "content": text}).status_code == 200

    def routed(prompt, schema, **kw):
        if schema.__name__ == "LinkChoice":
            return schema(links=[linking.LinkItem(anchor_text="portfolio guide", target_path="/blog/portfolio", context_sentence="See it."),
                                 linking.LinkItem(anchor_text="ghost", target_path="/ghost", context_sentence="x")])
        return fake_llm(prompt, schema, **kw)

    monkeypatch.setattr(llm, "generate_structured", routed)
    rid = client.post(START, headers=PRO, json=BODY).json()["run_id"]  # note: no site_paths at all
    run = client.get(f"/api/v1/runs/{rid}", headers=PRO).json()
    data = run["data"]
    assert run["status"] == "completed"
    assert [link["target_path"] for link in data["internal_links"]] == ["/blog/portfolio"]
    assert any("Knowledge base:" in (a["details"] or "") for a in data["audit_trail"])
    assert "owner_id" not in data  # internal field is never stored or returned

    free = client.post(START, headers=FREE, json=BODY).json()["run_id"]
    assert client.get(f"/api/v1/runs/{free}", headers=FREE).json()["data"]["internal_links"] == []


def test_empty_knowledge_base_falls_back_to_site_paths(kb_env, client, monkeypatch):
    monkeypatch.setattr(llm, "generate_structured", fake_llm)
    rid = client.post(START, headers=PRO, json={**BODY, "site_paths": ["/pricing", "/about"]}).json()["run_id"]
    data = client.get(f"/api/v1/runs/{rid}", headers=PRO).json()["data"]
    assert [link["target_path"] for link in data["internal_links"]] == ["/pricing"]
