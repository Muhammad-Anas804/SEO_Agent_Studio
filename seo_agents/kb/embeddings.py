"""Lightweight deterministic embeddings with an optional test override."""
from __future__ import annotations

import hashlib
import math
import re
from typing import Iterable

_override = None
_DIMENSIONS = 384


class LocalEmbeddings:
    """Small deterministic fallback embedding; no API key required."""

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * _DIMENSIONS
        words = re.findall(r"\w+", text.lower())

        for word in words:
            digest = hashlib.blake2b(word.encode("utf-8"), digest_size=8).digest()
            number = int.from_bytes(digest, "big")
            index = number % _DIMENSIONS
            sign = 1.0 if (number >> 8) & 1 else -1.0
            vector[index] += sign

        norm = math.sqrt(sum(value * value for value in vector))
        if norm:
            vector = [value / norm for value in vector]
        return vector

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)


_default = LocalEmbeddings()


def get_embeddings():
    """Return the test override when supplied, otherwise local embeddings."""
    return _override if _override is not None else _default


def embed_documents(texts: list[str]) -> list[list[float]]:
    return get_embeddings().embed_documents(texts)


def embed_query(text: str) -> list[float]:
    return get_embeddings().embed_query(text)
