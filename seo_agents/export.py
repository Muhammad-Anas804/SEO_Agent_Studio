"""Turn a finished run into a downloadable file: Markdown, HTML (CMS-ready) or JSON."""
from __future__ import annotations

import base64
import html
import json
import re
from typing import Any, Optional

import markdown as md
import nh3

_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "strong", "em", "a", "blockquote",
         "code", "pre", "br", "hr", "table", "thead", "tbody", "tr", "th", "td"}


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "article"


_HERO_LINE = re.compile(r"^!\[([^\]]*)\]\(image://hero\)\s*$", re.M)
_HERO_TOKEN = "HEROIMAGEPLACEHOLDER"


def article_html(markdown_text: str, hero: Optional[tuple[bytes, str]] = None, alt: str = "") -> str:
    found = _HERO_LINE.search(markdown_text)
    alt = alt or (found.group(1) if found else "")
    raw = md.markdown(_HERO_LINE.sub(f"\n\n{_HERO_TOKEN}\n\n", markdown_text), extensions=["extra", "sane_lists"])
    clean = nh3.clean(raw, tags=_TAGS, attributes={"a": {"href", "title"}}, url_schemes={"http", "https", "mailto"})
    figure = ""
    if hero:
        encoded = base64.b64encode(hero[0]).decode("ascii")
        figure = f'<figure><img src="data:{hero[1]};base64,{encoded}" alt="{html.escape(alt, quote=True)}" style="max-width:100%;height:auto"></figure>'
    return clean.replace(f"<p>{_HERO_TOKEN}</p>", figure)


def _ld(script_json: str) -> str:
    safe = script_json.replace("</", "<\\/")
    return f'<script type="application/ld+json">\n{safe}\n</script>'


def build_export(data: dict[str, Any], fmt: str, hero: Optional[tuple[bytes, str]] = None) -> tuple[str, str, str]:
    """Returns (body, media_type, filename)."""
    slug = slugify(data.get("target_keyword", "article"))
    article = data.get("generated_article_markdown") or ""
    title = data.get("meta_title") or data.get("target_keyword", "")
    desc = data.get("meta_description") or ""

    if fmt == "json":
        return json.dumps(data, indent=2, ensure_ascii=False), "application/json", f"{slug}.json"

    hero_meta = data.get("hero_image") or {}
    if fmt == "md":
        if hero and hero_meta:
            article = article.replace("image://hero", f"{slug}-hero.{hero_meta.get('filename', 'x.png').rsplit('.', 1)[-1]}")
        else:
            article = _HERO_LINE.sub("", article)
        front = f"---\ntitle: {json.dumps(title, ensure_ascii=False)}\ndescription: {json.dumps(desc, ensure_ascii=False)}\n---\n\n"
        return front + article + "\n", "text/markdown; charset=utf-8", f"{slug}.md"

    schema = data.get("schema_markup") or {}
    scripts = "\n".join(_ld(s) for s in (schema.get("json_ld_article"), schema.get("json_ld_faq")) if s)
    canonical = data.get("target_url") or ""
    page = (
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        f"<title>{html.escape(title)}</title>\n"
        f"<meta name=\"description\" content=\"{html.escape(desc, quote=True)}\">\n"
        + (f"<link rel=\"canonical\" href=\"{html.escape(canonical, quote=True)}\">\n" if canonical else "")
        + f"{scripts}\n</head>\n<body>\n<article>\n{article_html(article, hero, hero_meta.get('alt_text', ''))}\n</article>\n</body>\n</html>\n"
    )
    return page, "text/html; charset=utf-8", f"{slug}.html"
