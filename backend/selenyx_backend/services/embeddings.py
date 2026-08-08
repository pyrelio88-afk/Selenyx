"""Local, failure-tolerant embeddings for hybrid retrieval.

The always-available path is a deterministic pure-Python feature hash.  Dense
embeddings are optional and use either Ollama's native ``/api/embed`` endpoint
or an OpenAI-compatible ``/embeddings`` endpoint.  No model package is imported
or downloaded by this module.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Literal, Sequence
from urllib.parse import urlsplit

import httpx

from selenyx_backend.settings import Settings

_TOKEN_RE = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_+.-]*|[\u4e00-\u9fff]+", re.UNICODE)
HASH_DIM = 384
HASH_BACKEND = "hash-v2"
EmbeddingRole = Literal["query", "document"]


def tokenize(text: str) -> list[str]:
    """Tokenize Latin words and Chinese character bigrams without dependencies."""
    tokens: list[str] = []
    for raw in _TOKEN_RE.findall(text or ""):
        token = raw.lower()
        if token and "\u4e00" <= token[0] <= "\u9fff":
            # A regex would otherwise treat a whole Chinese sentence as one
            # token, making lexical/hash retrieval miss shorter queries.
            if len(token) == 1:
                tokens.append(token)
            else:
                tokens.extend(token[i : i + 2] for i in range(len(token) - 1))
        else:
            tokens.append(token)
    return tokens


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
    a_norm = math.sqrt(sum(x * x for x in a))
    b_norm = math.sqrt(sum(y * y for y in b))
    dot = sum(x * y for x, y in zip(a, b))
    if not all(math.isfinite(value) for value in (a_norm, b_norm, dot)):
        return 0.0
    if not a_norm or not b_norm:
        return 0.0
    return float(dot / (a_norm * b_norm))


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


def _provider(settings: Settings) -> str:
    value = (settings.embed_provider or "openai-compatible").strip().lower()
    return "ollama" if value == "ollama" else "openai-compatible"


def dense_backend_id(settings: Settings) -> str | None:
    """Return a non-secret identity used to prevent cross-model comparisons."""
    base = (settings.embed_base_url or "").strip()
    model = (settings.embed_model or "").strip()
    if not base or not model:
        return None
    try:
        endpoint = urlsplit(base)
        port = endpoint.port
    except ValueError:
        return None
    if endpoint.scheme.lower() not in {"http", "https"} or not endpoint.hostname:
        return None
    location = (
        f"{endpoint.scheme.lower()}://{endpoint.hostname.lower()}:{port or ''}"
        f"{endpoint.path.rstrip('/')}"
    )
    fingerprint = hashlib.blake2s(
        (
            f"{_provider(settings)}\0{location}\0{model}\0"
            f"{settings.embed_query_prefix}\0{settings.embed_document_prefix}"
        ).encode("utf-8"),
        digest_size=8,
    ).hexdigest()
    return f"dense-v1:{fingerprint}"


def embedding_runtime_summary(settings: Settings) -> dict[str, str | bool | None]:
    """Describe configuration without probing the endpoint or exposing secrets."""
    configured = dense_backend_id(settings) is not None
    return {
        "configured": configured,
        "mode": "dense-with-hash-fallback" if configured else "hash-only",
        "provider": _provider(settings) if configured else None,
        "model": settings.embed_model.strip() or None,
        "fallback": HASH_BACKEND,
    }


def _with_role_prefix(texts: list[str], settings: Settings, role: EmbeddingRole) -> list[str]:
    prefix = settings.embed_query_prefix if role == "query" else settings.embed_document_prefix
    return [f"{prefix}{text}" if prefix else text for text in texts]


def _new_http_client(timeout: float) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout)


def _parse_openai_embeddings(data: object, expected: int) -> list[list[float]] | None:
    if not isinstance(data, dict) or not isinstance(data.get("data"), list):
        return None
    items = data["data"]
    if len(items) != expected:
        return None
    if all(isinstance(item, dict) and isinstance(item.get("index"), int) for item in items):
        if {item["index"] for item in items} != set(range(expected)):
            return None
        items = sorted(items, key=lambda item: item["index"])
    return _validate_vectors(
        [item.get("embedding") if isinstance(item, dict) else None for item in items], expected
    )


def _parse_ollama_embeddings(data: object, expected: int) -> list[list[float]] | None:
    if not isinstance(data, dict):
        return None
    return _validate_vectors(data.get("embeddings"), expected)


def _validate_vectors(raw: object, expected: int) -> list[list[float]] | None:
    if not isinstance(raw, list) or len(raw) != expected:
        return None
    vectors: list[list[float]] = []
    dimension: int | None = None
    try:
        for item in raw:
            if not isinstance(item, list) or not item:
                return None
            vector = [float(value) for value in item]
            if not all(math.isfinite(value) for value in vector):
                return None
            dimension = dimension or len(vector)
            if len(vector) != dimension:
                return None
            vectors.append(vector)
    except (TypeError, ValueError, OverflowError):
        return None
    return vectors


async def dense_embed(
    texts: list[str], settings: Settings, *, role: EmbeddingRole = "document"
) -> list[list[float]] | None:
    """Return optional dense vectors, or ``None`` for a safe hash fallback."""
    base = (settings.embed_base_url or "").strip()
    model = (settings.embed_model or "").strip()
    if not base or not model:
        return None
    if not texts:
        return []
    provider = _provider(settings)
    url = (
        f"{base.rstrip('/')}/api/embed"
        if provider == "ollama"
        else f"{base.rstrip('/')}/embeddings"
    )
    headers = {"Content-Type": "application/json"}
    if settings.embed_api_key.strip():
        headers["Authorization"] = f"Bearer {settings.embed_api_key.strip()}"
    elif settings.llm_api_key.strip() and base.rstrip("/") == settings.llm_base_url.rstrip("/"):
        headers["Authorization"] = f"Bearer {settings.llm_api_key.strip()}"
    try:
        async with _new_http_client(settings.embed_timeout_seconds) as client:
            resp = await client.post(
                url,
                headers=headers,
                json={"model": model, "input": _with_role_prefix(texts, settings, role)},
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
        parser = _parse_ollama_embeddings if provider == "ollama" else _parse_openai_embeddings
        return parser(data, len(texts))
    except (httpx.HTTPError, ValueError, TypeError, OverflowError):
        return None


async def embed_texts(
    texts: list[str], settings: Settings, *, role: EmbeddingRole = "document"
) -> tuple[list[list[float]], str]:
    """Return (vectors, backend_name)."""
    dense = await dense_embed(texts, settings, role=role)
    if dense is not None:
        return dense, dense_backend_id(settings) or "dense-v1:unknown"
    # Model-specific prefixes are irrelevant to the feature-hash fallback and
    # would make query/document overlap worse, so keep the raw user text here.
    return [hash_embed(text) for text in texts], HASH_BACKEND
