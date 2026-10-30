from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
_LANGUAGE = re.compile(r"^[A-Za-z][A-Za-z \-]{1,29}$")
ALLOWED_TONES = {"professional", "conversational", "friendly", "authoritative", "persuasive", "technical"}


class JSONLDSchema(BaseModel):
    json_ld_article: str
    json_ld_faq: Optional[str] = None


class AgentAuditLog(BaseModel):
    agent_name: str
    execution_time_ms: float
    status: str = "SUCCESS"
    details: Optional[str] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class InternalLinkSuggestion(BaseModel):
    anchor_text: str
    target_path: str
    context_sentence: str


class SERPResult(BaseModel):
    position: int
    title: str
    url: str
    snippet: str = ""


class SERPQuestion(BaseModel):
    question: str
    answer: str = ""


class SERPData(BaseModel):
    results: List[SERPResult] = Field(default_factory=list)
    people_also_ask: List[SERPQuestion] = Field(default_factory=list)
    related_searches: List[str] = Field(default_factory=list)
    cached: bool = False


class AIUsage(BaseModel):
    step: str
    provider: str
    model: str
    attempts: int = 1
    fallback_used: bool = False


class HeroImage(BaseModel):
    filename: str
    mime: str
    provider: str
    model: str
    prompt: str
    alt_text: str
    size_bytes: int


class SEOCheck(BaseModel):
    name: str
    passed: bool
    detail: str
    weight: int


class SEOReport(BaseModel):
    score: int
    checks: List[SEOCheck] = Field(default_factory=list)


class SEOState(BaseModel):
    run_id: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    target_keyword: str
    target_url: Optional[str] = ""
    is_pro_tier: bool = False
    site_paths: List[str] = Field(default_factory=list)
    owner_id: str = Field(default="", exclude=True)  # owns the knowledge base; never stored or returned
    generate_image: bool = False
    tone: str = "professional"
    word_count_target: int = Field(default=1500, ge=600, le=3000)
    language: str = "English"

    search_intent: Optional[str] = None
    lsi_keywords: List[str] = Field(default_factory=list)
    target_audience: Optional[str] = None

    content_outline: List[str] = Field(default_factory=list)
    content_gap_insights: List[str] = Field(default_factory=list)

    meta_title: Optional[str] = None
    meta_description: Optional[str] = None
    generated_article_markdown: Optional[str] = None
    estimated_read_time_minutes: int = 0

    schema_markup: Optional[JSONLDSchema] = None
    internal_links: List[InternalLinkSuggestion] = Field(default_factory=list)
    seo_report: Optional[SEOReport] = None
    serp: Optional[SERPData] = None
    ai_usage: List[AIUsage] = Field(default_factory=list)
    image_prompt: Optional[str] = None
    image_alt: Optional[str] = None
    hero_image: Optional[HeroImage] = None
    ready_for_cms_publish: bool = False

    audit_trail: List[AgentAuditLog] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(arbitrary_types_allowed=True)

    @field_validator("target_keyword")
    @classmethod
    def _clean_keyword(cls, v: str) -> str:
        v = re.sub(r"\s+", " ", _CONTROL_CHARS.sub(" ", v)).strip()
        if not 2 <= len(v) <= 120:
            raise ValueError("target_keyword must be 2-120 characters")
        return v

    @field_validator("target_url")
    @classmethod
    def _clean_url(cls, v: Optional[str]) -> str:
        if not v or not v.strip():
            return ""
        v = v.strip()
        parsed = urlparse(v)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or len(v) > 500:
            raise ValueError("target_url must be a valid http(s) URL")
        return v

    @field_validator("tone")
    @classmethod
    def _clean_tone(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ALLOWED_TONES:
            raise ValueError("tone must be one of: " + ", ".join(sorted(ALLOWED_TONES)))
        return v

    @field_validator("language")
    @classmethod
    def _clean_language(cls, v: str) -> str:
        v = re.sub(r"\s+", " ", v).strip()
        if not _LANGUAGE.match(v):
            raise ValueError("language must be a language name in English letters, e.g. English or Spanish")
        return v

    @field_validator("site_paths")
    @classmethod
    def _clean_paths(cls, v: List[str]) -> List[str]:
        if len(v) > 200:
            raise ValueError("site_paths accepts at most 200 paths")
        cleaned: List[str] = []
        for path in v:
            path = path.strip()
            if not path:
                continue
            if not path.startswith("/") or len(path) > 200 or _CONTROL_CHARS.search(path):
                raise ValueError(f"invalid site path: {path[:40]!r} (must start with '/')")
            if path not in cleaned:
                cleaned.append(path)
        return cleaned
