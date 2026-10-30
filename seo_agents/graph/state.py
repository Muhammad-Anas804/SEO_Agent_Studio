"""Shared state that flows through the graph. Each node returns a partial update."""
from __future__ import annotations

import operator
from typing import Annotated, TypedDict


class PipelineState(TypedDict, total=False):
    # inputs
    target_keyword: str
    tone: str
    language: str
    word_count_target: int

    # produced by nodes
    search_intent: str
    serp: dict
    outline: list[str]
    article_markdown: str
    seo_score: int
    meta_title: str
    meta_description: str
    internal_links: list[dict]

    # revise loop control
    revision_count: int

    # lists are APPENDED across nodes (operator.add) instead of overwritten
    audit_trail: Annotated[list[dict], operator.add]
    errors: Annotated[list[str], operator.add]