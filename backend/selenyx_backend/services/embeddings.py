"""Local hybrid embeddings.

Default path is a pure-Python hashing embedder (no model download).
When SELENYX_EMBED_BASE_URL is set (OpenAI-compatible /embeddings, e.g. Ollama
nomic-embed-text), dense vectors are preferred and lexical scores still blend in.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Sequence

import httpx

from selenyx_backend.settings import Settings

_TOKEN_RE = re.compile(r"[\w\u4e00-\u9fff]{2,}", re.UNICODE)
HASH_DIM = 384


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text or "")]


def hash_embed(text: str, dim: int = HASH_DIM) -> list[float]:
    """Feature-hashing bag-of-words embedding (always available offline)."""
    vec = [0.0] * dim
    tokens = tokenize(text)
    if not tokens:
        return vec
    for token in tokens:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        idx = int.from_bytes(digest[:4], "little") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        # mild TF boost
        vec[idx] += sign
    # L2 normalize
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return float(sum(x * y for x, y in zip(a, b)))


def lexical_score(query: str, document: str) -> float:
    """Simple BM25-ish overlap score for hybrid retrieval."""
    q = set(tokenize(query))
    if not q:
        return 0.0
    d_tokens = tokenize(document)
    if not d_tokens:
        return 0.0
    tf: dict[str, int] = {}
    for t in d_tokens:
        tf[t] = tf.get(t, 0) + 1
    score = 0.0
    avgdl = 120.0
    dl = len(d_tokens)
    k1, b = 1.2, 0.75
    for term in q:
        f = tf.get(term, 0)
        if f == 0:
            continue
        idf = 1.5  # local corpus-free prior
        score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / avgdl))
    return score


async def dense_embed(texts: list[str], settings: Settings) -> list[list[float]] | None:
    """Optional OpenAI-compatible embeddings. Returns None if not configured/failed."""
    base = (settings.embed_base_url or "").strip()
    model = (settings.embed_model or "").strip()
    if not base or not model:
        return None
    url = f"{base.rstrip('/')}/embeddings"
    headers = {"Content-Type": "application/json"}
    if settings.embed_api_key.strip():
        headers["Authorization"] = f"Bearer {settings.embed_api_key.strip()}"
    elif settings.llm_api_key.strip() and base.rstrip("/") == settings.llm_base_url.rstrip("/"):
        headers["Authorization"] = f"Bearer {settings.llm_api_key.strip()}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json={"model": model, "input": texts})
        if resp.status_code != 200:
            return None
        data = resp.json()
        items = data.get("data")
        if not isinstance(items, list) or len(items) != len(texts):
            return None
        out: list[list[float]] = []
        for item in items:
            emb = item.get("embedding") if isinstance(item, dict) else None
            if not isinstance(emb, list) or not emb:
                return None
            out.append([float(x) for x in emb])
        return out
    except (httpx.HTTPError, ValueError, TypeError):
        return None


async def embed_texts(texts: list[str], settings: Settings) -> tuple[list[list[float]], str]:
    """Return (vectors, backend_name)."""
    dense = await dense_embed(texts, settings)
    if dense is not None:
        return dense, "dense"
    return [hash_embed(t) for t in texts], "hash"
