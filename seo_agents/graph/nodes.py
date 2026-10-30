"""
One function per agent. Each takes the state and returns a PARTIAL state update.

STUBS: bodies are placeholders. Step 2 replaces each with the real logic
ported from seo_brain.py, keeping the same inputs and outputs.
"""
from __future__ import annotations

import time

from .state import PipelineState


def _trail(agent: str, started: float, status: str = "SUCCESS") -> list[dict]:
    return [{"agent_name": agent, "status": status, "execution_time_ms": int((time.time() - started) * 1000)}]


def keyword_intent(state: PipelineState) -> dict:
    t = time.time()
    return {"search_intent": "informational", "audit_trail": _trail("KeywordIntentAgent", t)}  # TODO port


def serp_research(state: PipelineState) -> dict:
    t = time.time()
    return {"serp": {}, "audit_trail": _trail("SerpAgent", t)}  # TODO port


def outline(state: PipelineState) -> dict:
    t = time.time()
    return {"outline": ["Intro", "Body", "Conclusion"], "audit_trail": _trail("OutlineAgent", t)}  # TODO port


def write_article(state: PipelineState) -> dict:
    t = time.time()
    return {"article_markdown": "# Draft", "revision_count": 0, "audit_trail": _trail("WriterAgent", t)}  # TODO port


def seo_score(state: PipelineState) -> dict:
    t = time.time()
    score = 60 + 15 * state.get("revision_count", 0)  # stub: improves with each revision
    return {"seo_score": score, "audit_trail": _trail("ScoreAgent", t)}  # TODO port real scoring


def revise_article(state: PipelineState) -> dict:
    t = time.time()
    return {
        "article_markdown": state.get("article_markdown", "") + "\n(revised)",
        "revision_count": state.get("revision_count", 0) + 1,
        "audit_trail": _trail("ReviseAgent", t),
    }  # TODO port


def internal_links(state: PipelineState) -> dict:
    t = time.time()
    return {"internal_links": [], "audit_trail": _trail("LinkAgent", t)}  # TODO port


def meta_and_schema(state: PipelineState) -> dict:
    t = time.time()
    return {"meta_title": "", "meta_description": "", "audit_trail": _trail("MetaSchemaAgent", t)}  # TODO port