from __future__ import annotations

from typing import Any, Dict, List, TypedDict

from langchain_core.documents import Document
from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.graph import StateGraph

from app.config import get_settings
from app.rag import compute_citations, get_vectorstore, similarity_with_scores


class SMEState(TypedDict, total=False):
    """Shared LangGraph state for SME-Plug."""

    question: str
    retrieved_docs: List[Document]
    scores: List[float]
    context_ok: bool
    answer: str
    citations: List[str]
    steps: List[Dict[str, Any]]


def build_llm() -> BaseChatModel:
    """Create an LLM instance according to settings."""
    settings = get_settings()

    if settings.llm_provider == "groq":
        from langchain_groq import ChatGroq

        if not settings.groq_api_key:
            raise RuntimeError(
                "GROQ_API_KEY is not set but llm_provider is 'groq'. "
                "Set GROQ_API_KEY or switch LLM_PROVIDER."
            )
        return ChatGroq(
            model=settings.groq_model,
            temperature=0.0,
            api_key=settings.groq_api_key,
        )

    if settings.llm_provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        if not settings.google_api_key:
            raise RuntimeError(
                "GOOGLE_API_KEY is not set but llm_provider is 'gemini'. "
                "Set GOOGLE_API_KEY or switch LLM_PROVIDER to 'openai'."
            )
        return ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            temperature=0.0,
        )

    # Default to OpenAI
    from langchain_openai import ChatOpenAI

    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set but llm_provider is 'openai'. "
            "Set OPENAI_API_KEY or switch LLM_PROVIDER to 'gemini'."
        )
    return ChatOpenAI(
        model=settings.openai_model,
        temperature=0.0,
    )


def _append_step(state: SMEState, node: str, status: str, detail: str) -> SMEState:
    steps = list(state.get("steps") or [])
    steps.append({"node": node, "status": status, "detail": detail})
    return {**state, "steps": steps}


def make_graph() -> Any:
    """Compile and return the LangGraph state machine."""

    settings = get_settings()
    vectorstore = get_vectorstore()
    llm = build_llm()

    def retrieve_docs(state: SMEState) -> SMEState:
        question = state["question"]
        # Retrieve the domain from state (this comes from payload.plugin in main.py)
        domain = state.get("plugin_mode", "none") 
        
        results = similarity_with_scores(
            vectorstore, 
            query=question, 
            k=settings.top_k,
            domain=domain # Filter applied here
        )
        
        docs, scores = zip(*results) if results else ([], [])
        
        new_state: SMEState = {
            "retrieved_docs": list(docs),
            "scores": list(scores),
        }
        
        detail = f"Retrieved {len(docs)} chunks from {domain} corpus" if domain != "none" else f"Retrieved {len(docs)} chunks"
        
        return _append_step(
            {**state, **new_state},
            node="retrieve_docs",
            status="ok",
            detail=detail,
        )

    def verify_context(state: SMEState) -> SMEState:
        scores = state.get("scores") or []
        if not scores:
            context_ok = False
            detail = "No chunks retrieved from vector store."
        else:
            best_score = float(scores[0])
            threshold = settings.similarity_threshold
            context_ok = best_score <= threshold
            detail = (
                f"Best distance {best_score:.4f} "
                f"vs threshold {threshold:.4f} -> context_ok={context_ok}"
            )

        new_state: SMEState = {
            "context_ok": context_ok,
        }
        new_state = _append_step(
            {**state, **new_state},
            node="verify_context",
            status="ok" if context_ok else "rejected",
            detail=detail,
        )
        return new_state

    def format_output(state: SMEState) -> SMEState:
        question = state["question"]
        docs = state.get("retrieved_docs") or []
        context_ok = bool(state.get("context_ok"))

        if not context_ok:
            # Strict RAG enforcement: never answer from general knowledge.
            domain_name = state.get("plugin_mode", "domain-specific")
            answer = (
                "I cannot safely answer this from the current knowledge base. "
                f"The retrieved '{domain_name}' documents do not contain a clearly relevant "
                "section for your question. Please provide additional or more specific "
                "source documents."
            )
            final_state = _append_step(
                {**state, "answer": answer, "citations": []},
                node="format_output",
                status="skipped_llm",
                detail="Context rejected, returned safe fallback without LLM call.",
            )
            return final_state

        # Build a compact context for the LLM
        context_blocks: List[str] = []
        for idx, doc in enumerate(docs, start=1):
            md = doc.metadata or {}
            doc_name = md.get("doc_name") or md.get("source") or f"Doc-{idx}"
            page_number = md.get("page_number") or md.get("page") or "?"
            context_blocks.append(
                f"[{idx}] {doc_name} (Page {page_number}):\n{doc.page_content}"
            )

        context_text = "\n\n---\n\n".join(context_blocks)

        system_msg = (
            "You are SME-Plug, a cybersecurity compliance expert assistant. "
            "You must answer ONLY using the provided context from official documents "
            "(ISO-27001, NIST, SOC2, etc.). If the context is insufficient, explicitly say "
            "you cannot answer from the available documents.\n\n"
            "Every substantive statement MUST be grounded in the context and accompanied "
            "by a citation in the form [Source: DocName, Page X]. Do not invent citations."
        )

        user_msg = (
            f"User question:\n{question}\n\n"
            "Relevant context from your knowledge base:\n"
            f"{context_text}\n\n"
            "Answer using only this context. Be concise but precise, and attach citations "
            "for each key claim."
        )

        response = llm.invoke(
            [
                ("system", system_msg),
                ("user", user_msg),
            ]
        )

        answer = response.content if hasattr(response, "content") else str(response)
        citations = compute_citations(docs)

        final_state: SMEState = {
            **state,
            "answer": answer,
            "citations": citations,
        }
        final_state = _append_step(
            final_state,
            node="format_output",
            status="ok",
            detail="LLM generated answer using retrieved context.",
        )
        return final_state

    graph = StateGraph(SMEState)
    graph.add_node("retrieve_docs", retrieve_docs)
    graph.add_node("verify_context", verify_context)
    graph.add_node("format_output", format_output)

    graph.set_entry_point("retrieve_docs")
    graph.add_edge("retrieve_docs", "verify_context")
    graph.add_edge("verify_context", "format_output")
    graph.set_finish_point("format_output")

    return graph.compile()

__all__ = ["SMEState", "make_graph", "build_llm"]

