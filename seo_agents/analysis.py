"""Deterministic on-page SEO checks (no LLM): gives customers a score they can trust."""
from __future__ import annotations

import re

from seo_agents.State import SEOCheck, SEOReport, SEOState

_VOWELS = re.compile(r"[aeiouy]+")


def _plain(markdown_text: str) -> str:
    text = re.sub(r"```.*?```", " ", markdown_text, flags=re.DOTALL)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^\s*#{1,6}\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*([-*+]|\d+\.)\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_`>|]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _covers(text: str, keyword: str) -> bool:
    text, keyword = text.lower(), keyword.lower()
    if keyword in text:
        return True
    words = [w for w in keyword.split() if len(w) > 2] or keyword.split()
    return bool(words) and all(w in text for w in words)


def _flesch(text: str) -> float:
    words = re.findall(r"[A-Za-z']+", text)
    if not words:
        return 0.0
    sentences = max(1, len(re.findall(r"[.!?]+(?:\s|$)", text)))
    syllables = sum(max(1, len(_VOWELS.findall(w.lower()))) for w in words)
    return 206.835 - 1.015 * (len(words) / sentences) - 84.6 * (syllables / len(words))


def analyze(state: SEOState) -> SEOReport:
    body = state.generated_article_markdown or ""
    plain = _plain(body)
    words = plain.split()
    kw = state.target_keyword
    title, desc = state.meta_title or "", state.meta_description or ""
    checks: list[SEOCheck] = []

    def add(name: str, passed: bool, detail: str, weight: int) -> None:
        checks.append(SEOCheck(name=name, passed=bool(passed), detail=detail, weight=weight))

    add("Meta title length (30-60 characters)", 30 <= len(title) <= 60, f"{len(title)} characters", 10)
    add("Keyword in meta title", _covers(title, kw), "Found" if _covers(title, kw) else "Keyword missing from the title", 10)
    add("Meta description length (120-160 characters)", 120 <= len(desc) <= 160, f"{len(desc)} characters", 10)
    add("Keyword in meta description", _covers(desc, kw), "Found" if _covers(desc, kw) else "Keyword missing from the description", 5)

    h1 = len(re.findall(r"^# (?!#)", body, flags=re.MULTILINE))
    h2 = len(re.findall(r"^## (?!#)", body, flags=re.MULTILINE))
    add("Exactly one H1 heading", h1 == 1, f"{h1} H1 heading(s)", 5)
    add("At least 3 H2 sections", h2 >= 3, f"{h2} H2 section(s)", 10)

    intro = " ".join(words[:100])
    add("Keyword in the first 100 words", _covers(intro, kw), "Found" if _covers(intro, kw) else "Mention the keyword earlier", 10)

    target = state.word_count_target
    add("Length close to target (within 25%)", abs(len(words) - target) <= target * 0.25, f"{len(words)} words (target {target})", 10)

    occurrences = plain.lower().count(kw.lower())
    density = (occurrences * len(kw.split()) / len(words) * 100) if words else 0.0
    add("Keyword density 0.3% to 2.5%", 0.3 <= density <= 2.5, f"{density:.1f}% ({occurrences} exact mention(s))", 10)

    if state.language.lower() == "english":
        ease = _flesch(plain)
        add("Readability (Flesch score 50 or higher)", ease >= 50, f"Flesch reading ease {ease:.0f}", 10)

    add("Article schema generated", bool(state.schema_markup and state.schema_markup.json_ld_article), "JSON-LD ready", 5)
    add("FAQ schema generated", bool(state.schema_markup and state.schema_markup.json_ld_faq), "FAQPage JSON-LD ready", 5)

    if state.is_pro_tier and state.site_paths:
        add("At least one internal link suggested", len(state.internal_links) >= 1, f"{len(state.internal_links)} link(s)", 5)

    total = sum(c.weight for c in checks)
    earned = sum(c.weight for c in checks if c.passed)
    return SEOReport(score=round(100 * earned / total) if total else 0, checks=checks)
