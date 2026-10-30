"""Wires the nodes into a graph. This file is the readable map of the pipeline."""
from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from . import nodes
from .state import PipelineState

SCORE_THRESHOLD = 75
MAX_REVISIONS = 2


def route_after_score(state: PipelineState) -> str:
    """Revise while the score is low, but never more than MAX_REVISIONS times."""
    needs_work = state.get("seo_score", 0) < SCORE_THRESHOLD
    can_retry = state.get("revision_count", 0) < MAX_REVISIONS
    return "revise_article" if needs_work and can_retry else "internal_links"


def build_graph():
    g = StateGraph(PipelineState)

    g.add_node("keyword_intent", nodes.keyword_intent)
    g.add_node("serp_research", nodes.serp_research)
    g.add_node("outline", nodes.outline)
    g.add_node("write_article", nodes.write_article)
    g.add_node("seo_score", nodes.seo_score)
    g.add_node("revise_article", nodes.revise_article)
    g.add_node("internal_links", nodes.internal_links)
    g.add_node("meta_and_schema", nodes.meta_and_schema)

    g.add_edge(START, "keyword_intent")
    g.add_edge("keyword_intent", "serp_research")
    g.add_edge("serp_research", "outline")
    g.add_edge("outline", "write_article")
    g.add_edge("write_article", "seo_score")
    g.add_conditional_edges("seo_score", route_after_score, ["revise_article", "internal_links"])
    g.add_edge("revise_article", "seo_score")  # the loop
    g.add_edge("internal_links", "meta_and_schema")
    g.add_edge("meta_and_schema", END)

    return g.compile()