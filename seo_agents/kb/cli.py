from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

from seo_agents.database import store as db
from seo_agents.kb import store

_FRONTMATTER = re.compile(r"\A---\s*\n(.*?)\n---\s*\n?", re.S)


def parse_markdown(text: str, fallback_title: str) -> tuple[str, str]:
    """Extract the title and body from Markdown or MDX."""
    title = ""
    match = _FRONTMATTER.match(text)

    if match:
        found = re.search(r"^title:\s*(.+)$", match.group(1), re.M)
        if found:
            title = found.group(1).strip().strip("\"'")
        text = text[match.end():]

    if not title:
        heading = re.search(r"^#\s+(.+)$", text, re.M)
        title = heading.group(1).strip() if heading else fallback_title

    return title, text


def owner_for(api_key: str | None) -> str:
    """Generate the same owner ID used by the API."""
    return (
        hashlib.sha256(api_key.encode()).hexdigest()[:16]
        if api_key
        else "anonymous-dev"
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Index Markdown/MDX pages into the SEO knowledge base"
    )
    parser.add_argument("--dir", required=True, help="Folder containing .md/.mdx files")
    parser.add_argument("--prefix", default="/blog", help="URL prefix, e.g. /blog")
    parser.add_argument("--api-key", help="API key that should own the indexed pages")
    args = parser.parse_args(argv)

    folder = Path(args.dir)
    if not folder.is_dir():
        print(f"Folder not found: {folder}")
        return 1

    db.init_db()
    owner = owner_for(args.api_key)
    prefix = "/" + args.prefix.strip("/")
    done = 0

    files = sorted(list(folder.rglob("*.md")) + list(folder.rglob("*.mdx")))

    for file in files:
        try:
            title, body = parse_markdown(
                file.read_text(encoding="utf-8", errors="ignore"),
                file.stem.replace("-", " "),
            )
            path = f"{prefix}/{file.stem}"
            chunks = store.upsert_page(owner, path, title, body)
            print(f"Indexed {path} ({chunks} chunks)")
            done += 1
        except store.KBError as exc:
            print(f"Skipped {file.name}: {exc}")

    print(f"Done: {done} page(s) indexed for owner {owner}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
