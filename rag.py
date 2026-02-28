from __future__ import annotations

from pathlib import Path
from typing import Iterable, List, Tuple

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

from app.config import get_settings


class LocalEmbeddings(Embeddings):
    """Wraps ChromaDB's built-in all-MiniLM-L6-v2 model as a LangChain Embeddings object.
    Runs 100% locally — no API keys required."""

    def __init__(self) -> None:
        self._ef = DefaultEmbeddingFunction()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[float(x) for x in vec] for vec in self._ef(texts)]

    def embed_query(self, text: str) -> list[float]:
        return [float(x) for x in self._ef([text])[0]]


def get_embeddings() -> Embeddings:
    """Return the local embedding model (no API keys needed)."""
    return LocalEmbeddings()


_vectorstore_cache = None

def get_vectorstore() -> Chroma:
    global _vectorstore_cache
    if _vectorstore_cache is not None:
        return _vectorstore_cache

    settings = get_settings()
    embeddings = get_embeddings()
    
    # Initialize the single shared connection
    _vectorstore_cache = Chroma(
        collection_name=settings.chroma_collection_name,
        embedding_function=embeddings,
        persist_directory=str(settings.chroma_db_dir),
    )
    return _vectorstore_cache


def compute_citations(docs: Iterable[Document]) -> List[str]:
    """Build unique citation strings like `[Source: ISO_27001, Page 12]`."""
    seen = set()
    citations: List[str] = []
    for doc in docs:
        md = doc.metadata or {}
        doc_name = md.get("doc_name") or Path(md.get("source", "Unknown")).stem
        page_number = md.get("page_number") or md.get("page") or "?"
        label = f"[Source: {doc_name}, Page {page_number}]"
        if label not in seen:
            seen.add(label)
            citations.append(label)
    return citations


def similarity_with_scores(
    vs: Chroma, 
    query: str, 
    k: int, 
    domain: str = None
) -> List[Tuple[Document, float]]:
    """
    Search with type clarity and optional domain filtering.
    If domain is provided, ChromaDB will only look at chunks where metadata['domain'] == domain.
    """
    search_kwargs = {}
    if domain and domain != "none":
        # This is the 'Where' clause for your vector database
        search_kwargs["filter"] = {"domain": domain}
    
    try:
        return vs.similarity_search_with_score(query, k=k, **search_kwargs)
    except Exception:
        # Fallback to empty if index fails or collection is empty/no domain filter matched
        return []

