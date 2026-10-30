"""Storing hero images safely and placing them in the article."""
from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from seo_agents.config import get_settings

MAX_BYTES = 8_000_000
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
HERO_URL = "image://hero"  # placeholder the UI and exports replace with a real address
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class ImageStorageError(ValueError):
    """The bytes are not a usable image."""


def sniff_mime(data: bytes) -> Optional[str]:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _folder() -> Path:
    return Path(get_settings().image_dir)


def _check_id(run_id: str) -> str:
    if not _UUID.match(run_id):
        raise ImageStorageError("invalid run id")
    return run_id


def save_image(run_id: str, data: bytes) -> tuple[str, str]:
    """Validate by content (never by what the provider claims) and store. Returns (filename, mime)."""
    _check_id(run_id)
    if not data or len(data) > MAX_BYTES:
        raise ImageStorageError(f"image is empty or larger than {MAX_BYTES // 1_000_000} MB")
    mime = sniff_mime(data)
    if mime is None:
        raise ImageStorageError("provider returned something that is not a PNG, JPEG or WebP image")
    _folder().mkdir(parents=True, exist_ok=True)
    filename = f"{run_id}.{EXTENSIONS[mime]}"
    (_folder() / filename).write_bytes(data)
    return filename, mime


def load_image(run_id: str) -> Optional[tuple[bytes, str]]:
    _check_id(run_id)
    for mime, ext in EXTENSIONS.items():
        path = _folder() / f"{run_id}.{ext}"
        if path.is_file():
            return path.read_bytes(), mime
    return None


def delete_image(run_id: str) -> None:
    try:
        _check_id(run_id)
    except ImageStorageError:
        return
    for ext in EXTENSIONS.values():
        (_folder() / f"{run_id}.{ext}").unlink(missing_ok=True)


def clean_alt(alt: str) -> str:
    """Alt text that cannot break Markdown or HTML, at most 125 characters."""
    alt = re.sub(r"[\[\]\(\)<>{}`\\\r\n]+", " ", alt)
    return " ".join(alt.split())[:125].strip()


def clip_prompt(prompt: str) -> str:
    return " ".join(prompt.split())[:600].strip()


def insert_hero(markdown: str, alt: str) -> str:
    """Put the hero image right after the first H1 (or at the very top if there is none)."""
    image = f"![{clean_alt(alt) or 'Article image'}]({HERO_URL})"
    lines = markdown.split("\n")
    for index, line in enumerate(lines):
        if re.match(r"^# (?!#)", line):
            return "\n".join(lines[: index + 1] + ["", image, ""] + lines[index + 1 :])
    return f"{image}\n\n{markdown}"
