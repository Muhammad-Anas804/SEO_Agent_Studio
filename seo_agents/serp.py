"""Real competitor research via the Serper.dev Google Search API."""
from __future__ import annotations

import logging
import time
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

from seo_agents.config import get_settings
from seo_agents.State import SERPData, SERPQuestion, SERPResult

logger = logging.getLogger("seo_agents.serp")
SERPER_URL = "https://google.serper.dev/search"


class SerpError(RuntimeError):
    """Raised when competitor research cannot be fetched."""


def _clip(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def normalize(payload: dict[str, Any]) -> SERPData:
    """Turn a raw Serper response into clean, bounded data (http/https links only)."""
    results: list[SERPResult] = []
    seen: set[str] = set()
    for index, item in enumerate(payload.get("organic") or [], start=1):
        url = str(item.get("link") or "").strip()
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or url in seen:
            continue
        seen.add(url)
        results.append(SERPResult(
            position=int(item.get("position") or index),
            title=_clip(item.get("title"), 200),
            url=url[:500],
            snippet=_clip(item.get("snippet"), 300),
        ))
        if len(results) >= 10:
            break

    questions: list[SERPQuestion] = []
    for item in payload.get("peopleAlsoAsk") or []:
        question = _clip(item.get("question"), 200)
        if question and question not in {q.question for q in questions}:
            questions.append(SERPQuestion(question=question, answer=_clip(item.get("snippet"), 300)))
        if len(questions) >= 8:
            break

    related: list[str] = []
    for item in payload.get("relatedSearches") or []:
        query = _clip(item.get("query"), 120)
        if query and query not in related:
            related.append(query)
        if len(related) >= 8:
            break

    return SERPData(results=results, people_also_ask=questions, related_searches=related)


def fetch_serp(keyword: str, language_code: str = "en", transport: Optional[httpx.BaseTransport] = None) -> SERPData:
    settings = get_settings()
    if not settings.serper_api_key:
        raise SerpError("SERPER_API_KEY is not configured")

    body = {"q": keyword, "gl": settings.serp_country, "hl": language_code, "num": 10}
    last_error: Exception | None = None
    for _ in range(2):
        try:
            with httpx.Client(timeout=15, transport=transport) as client:
                response = client.post(SERPER_URL, json=body, headers={"X-API-KEY": settings.serper_api_key})
            if response.status_code in (401, 403):
                raise SerpError("Serper rejected the API key")
            if response.status_code == 429:
                raise SerpError("Serper rate limit reached or out of credits")
            response.raise_for_status()
            return normalize(response.json())
        except SerpError:
            raise
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            logger.warning("serper request failed: %s", exc)
            time.sleep(1)
    raise SerpError(f"Serper request failed: {last_error}")
