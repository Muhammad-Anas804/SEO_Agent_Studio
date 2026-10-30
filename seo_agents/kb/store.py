"""Per-owner knowledge base of site pages, stored in ChromaDB through LangChain."""
from __future__ import annotations

import re
from typing import Any

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from seo_agents.config import get_settings
from seo_agents.kb.embeddings import get_embeddings

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")
MAX_CONTENT_CHARS = 200_000
MAX_CHUNKS_PER_PAGE = 40


class KBError(ValueError):
    """Bad input or a limit was reached (safe to show to the user)."""


def _store(owner: str) -> Chroma:
    import chromadb

    path = get_settings().chroma_path
    return Chroma(
        collection_name=f"kb_{re.sub(r'[^A-Za-z0-9_-]', '_', owner)}"[:200],
        embedding_function=get_embeddings(),
        persist_directory=path,
        client_settings=chromadb.config.Settings(anonymized_telemetry=False, is_persistent=True, persist_directory=path),
        collection_metadata={"hnsw:space": "cosine"},
    )


def validate_path(path: str) -> str:
    path = path.strip()
    if not path.startswith("/") or len(path) > 200 or _CONTROL.search(path):
        raise KBError("path must start with '/' and be at most 200 characters, e.g. /blog/my-post")
    return path


def list_pages(owner: str) -> list[dict[str, Any]]:
    metadatas = _store(owner).get(include=["metadatas"]).get("metadatas") or []
    pages: dict[str, dict[str, Any]] = {}
    for meta in metadatas:
        entry = pages.setdefault(meta["path"], {"path": meta["path"], "title": meta.get("title", ""), "chunks": 0})
        entry["chunks"] += 1
    return sorted(pages.values(), key=lambda p: p["path"])


def upsert_page(owner: str, path: str, title: str, content: str) -> int:
    """Index (or re-index) one page. Returns the number of chunks stored."""
    path = validate_path(path)
    title = " ".join(title.split())[:200] or path
    content = content.strip()
    if not content:
        raise KBError("content is empty")
    if len(content) > MAX_CONTENT_CHARS:
        raise KBError(f"content is too long (limit {MAX_CONTENT_CHARS} characters)")

    store = _store(owner)
    known = {p["path"] for p in list_pages(owner)}
    if path not in known and len(known) >= get_settings().kb_max_pages:
        raise KBError(f"knowledge base limit reached ({get_settings().kb_max_pages} pages)")

    splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)
    chunks = splitter.split_text(content)[:MAX_CHUNKS_PER_PAGE]
    store.delete(where={"path": path})  # re-indexing replaces the old chunks
    store.add_documents(
        [Document(page_content=f"{title}\n{chunk}", metadata={"path": path, "title": title, "chunk": i})
         for i, chunk in enumerate(chunks)],
        ids=[f"{path}#{i}" for i in range(len(chunks))],
    )
    return len(chunks)


def delete_page(owner: str, path: str) -> bool:
    path = validate_path(path)
    existed = any(p["path"] == path for p in list_pages(owner))
    if existed:
        _store(owner).delete(where={"path": path})
    return existed


def count_pages(owner: str) -> int:
    return len(list_pages(owner))


def search(owner: str, query: str, k: int = 8) -> list[dict[str, Any]]:
    """Most relevant pages for `query` (best chunk per page), highest similarity first."""
    if not owner or count_pages(owner) == 0:
        return []
    hits = _store(owner).similarity_search_with_score(query[:2000], k=k * 3)
    best: dict[str, dict[str, Any]] = {}
    for doc, distance in hits:
        path = doc.metadata["path"]
        similarity = round(1.0 - float(distance), 4)
        if path not in best or similarity > best[path]["score"]:
            best[path] = {"path": path, "title": doc.metadata.get("title", ""),
                          "snippet": " ".join(doc.page_content.split())[:240], "score": similarity}
    return sorted(best.values(), key=lambda r: r["score"], reverse=True)[:k]
