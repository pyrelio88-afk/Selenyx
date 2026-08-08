"""Embedding contracts: local fallback, provider protocols, model isolation."""

import json

import httpx
import pytest
from sqlmodel import Session, SQLModel, create_engine

import selenyx_backend.services.embeddings as embeddings
import selenyx_backend.services.rag as rag
from selenyx_backend.models import DocumentChunk, Reference
from selenyx_backend.services.embeddings import (
    HASH_BACKEND,
    cosine,
    dense_backend_id,
    embed_texts,
    tokenize,
)
from selenyx_backend.settings import Settings


def test_hash_tokenizer_supports_short_chinese_queries_and_real_cosine():
    tokens = tokenize("护理交接质量 SBAR")
    assert "护理" in tokens
    assert "交接" in tokens
    assert "sbar" in tokens
    assert cosine([2.0, 0.0], [5.0, 0.0]) == pytest.approx(1.0)
    assert cosine([1.0], [1.0, 2.0]) == 0.0
    assert cosine([float("nan")], [1.0]) == 0.0


@pytest.mark.asyncio
async def test_unconfigured_embedding_is_zero_download_hash_fallback():
    vectors, backend = await embed_texts(
        ["local evidence"], Settings(embed_base_url="", embed_model="")
    )
    assert backend == HASH_BACKEND
    assert len(vectors) == 1
    assert len(vectors[0]) == embeddings.HASH_DIM
    empty, empty_backend = await embed_texts(
        [], Settings(embed_base_url="", embed_model="")
    )
    assert empty == []
    assert empty_backend == HASH_BACKEND


@pytest.mark.asyncio
async def test_native_ollama_protocol_and_role_prefix(monkeypatch):
    seen: list[httpx.Request] = []

    def upstream(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"embeddings": [[3.0, 4.0], [0.0, 2.0]]})

    monkeypatch.setattr(
        embeddings,
        "_new_http_client",
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(upstream), timeout=timeout
        ),
    )
    settings = Settings(
        embed_provider="ollama",
        embed_base_url="http://127.0.0.1:11434",
        embed_model="embeddinggemma",
        embed_document_prefix="passage: ",
    )

    vectors, backend = await embed_texts(["one", "two"], settings, role="document")

    assert vectors == [[3.0, 4.0], [0.0, 2.0]]
    assert backend == dense_backend_id(settings)
    assert seen[0].url.path == "/api/embed"
    assert seen[0].headers.get("authorization") is None
    assert json.loads(seen[0].content)["input"] == ["passage: one", "passage: two"]


@pytest.mark.asyncio
async def test_bad_dense_response_falls_back_without_storing_invalid_vectors(monkeypatch):
    def upstream(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [float("nan")]}]})

    monkeypatch.setattr(
        embeddings,
        "_new_http_client",
        lambda timeout: httpx.AsyncClient(
            transport=httpx.MockTransport(upstream), timeout=timeout
        ),
    )
    settings = Settings(
        embed_base_url="https://embedding.example/v1",
        embed_model="multilingual-model",
    )

    vectors, backend = await embed_texts(["evidence"], settings)

    assert backend == HASH_BACKEND
    assert len(vectors[0]) == embeddings.HASH_DIM


def test_dense_identity_changes_with_model_without_exposing_endpoint():
    first = Settings(embed_base_url="https://secret.example/v1", embed_model="model-a")
    second = Settings(embed_base_url="https://secret.example/v1", embed_model="model-b")

    assert dense_backend_id(first) != dense_backend_id(second)
    assert "secret" not in (dense_backend_id(first) or "")

    prefixed = Settings(
        embed_base_url="https://secret.example/v1",
        embed_model="model-a",
        embed_query_prefix="query: ",
    )
    assert dense_backend_id(first) != dense_backend_id(prefixed)
    assert dense_backend_id(Settings(embed_base_url="not-a-url", embed_model="model-a")) is None


@pytest.mark.asyncio
async def test_search_rehashes_chunks_from_a_different_dense_model(monkeypatch):
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)

    async def new_model_query(texts, settings, *, role="document"):
        assert role == "query"
        return [[-1.0, 0.0]], "dense-v1:new-model"

    monkeypatch.setattr(rag, "embed_texts", new_model_query)
    with Session(engine) as session:
        session.add(Reference(id="ref-1", title="护理交接研究"))
        session.add(
            DocumentChunk(
                reference_id="ref-1",
                text="护理交接质量评价与患者安全",
                embedding_json="[1.0,0.0]",
                embedding_backend="dense-v1:old-model",
            )
        )
        session.commit()

        hits = await rag.semantic_search(
            session,
            "护理交接",
            settings=Settings(embed_base_url="", embed_model=""),
        )

    assert [hit.reference_id for hit in hits] == ["ref-1"]
