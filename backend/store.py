"""ChromaDB storage: long-term memories and an index of the pages Minima has read for you.

Concepts: Embeddings (+ on-disk cache), Chroma vector store, text splitter, metadata filters, similarity search.
Created lazily, so the server starts instantly even before the embedding model is downloaded.
"""
from __future__ import annotations

import hashlib
import logging
import threading
from functools import lru_cache
from urllib.parse import urlparse

from langchain_core.embeddings import DeterministicFakeEmbedding, Embeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from . import config

log = logging.getLogger("navi.store")
_lock = threading.Lock()


def _base_embeddings() -> Embeddings:
    if config.EMBEDDINGS_PROVIDER == "fake":  # tests only: vectors carry no meaning
        return DeterministicFakeEmbedding(size=384)
    if config.EMBEDDINGS_PROVIDER == "huggingface":
        from langchain_huggingface import HuggingFaceEmbeddings

        return HuggingFaceEmbeddings(model_name=config.EMBEDDINGS_MODEL)
    from langchain_community.embeddings import FastEmbedEmbeddings  # small ONNX model, no torch

    return FastEmbedEmbeddings(model_name=config.EMBEDDINGS_MODEL)


@lru_cache(maxsize=1)
def get_embeddings() -> Embeddings:
    base = _base_embeddings()
    try:
        from langchain_classic.embeddings import CacheBackedEmbeddings
        from langchain_classic.storage import LocalFileStore

        return CacheBackedEmbeddings.from_bytes_store(
            base,
            LocalFileStore(str(config.EMBED_CACHE_DIR)),
            namespace=f"{config.EMBEDDINGS_PROVIDER}-{config.EMBEDDINGS_MODEL}",
            query_embedding_cache=True,
        )
    except Exception:  # cache layer is optional
        return base


def _sha(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


class Store:
    def __init__(self) -> None:
        from langchain_chroma import Chroma

        emb = get_embeddings()
        kw = dict(embedding_function=emb, persist_directory=str(config.CHROMA_DIR))
        self.pages = Chroma(collection_name="navi_pages", **kw)
        self.memories = Chroma(collection_name="navi_memories", **kw)
        self.splitter = RecursiveCharacterTextSplitter(chunk_size=900, chunk_overlap=120)

    # ---- pages the agent has read (re-indexed whenever the same URL is read again)
    def index_page(self, url: str, title: str, text: str) -> int:
        text = (text or "").strip()
        if len(text) < 80:
            return 0
        chunks = self.splitter.split_text(text)
        host = urlparse(url).hostname or ""
        base = _sha(url)
        with _lock:
            self.pages._collection.delete(where={"url": url})
            self.pages.add_texts(
                chunks,
                metadatas=[{"url": url, "title": title[:120], "host": host, "chunk": i} for i in range(len(chunks))],
                ids=[f"{base}-{i}" for i in range(len(chunks))],
            )
        return len(chunks)

    def search_pages(self, query: str, k: int = 4):
        return self.pages.similarity_search(query, k=k)

    # ---- long-term memory (id = hash of the text, so saving the same fact twice is a no-op)
    def add_memory(self, fact: str) -> bool:
        fact = " ".join(fact.split())[:500]
        mid = _sha(fact.lower())
        with _lock:
            if self.memories.get(ids=[mid])["ids"]:
                return False
            self.memories.add_texts([fact], metadatas=[{"kind": "fact"}], ids=[mid])
        return True

    def search_memory(self, query: str, k: int = 5) -> list[str]:
        if not self.memories.get(limit=1)["ids"]:
            return []
        return [d.page_content for d in self.memories.similarity_search(query, k=k)]

    def all_memories(self) -> list[dict]:
        got = self.memories.get()
        return [{"id": i, "text": t} for i, t in zip(got["ids"], got["documents"])]

    def delete_memory(self, mid: str) -> None:
        with _lock:
            self.memories.delete(ids=[mid])


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store
