from __future__ import annotations

import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="langchain_core._api.deprecation")



from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.config import get_settings
from app.graph import SMEState, make_graph, build_llm


class AskRequest(BaseModel):
    question: str = Field(..., description="User's natural language question.")
    plugin: str = Field(default="none", description="Which expert module to use (e.g., 'SoftwareEngineer', 'none').")


class StepLog(BaseModel):
    node: str
    status: str
    detail: str


class AskResponse(BaseModel):
    answer: str
    citations: List[str]
    steps: List[StepLog]


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="SME-Plug Backend",
        description=(
            "Hot-swappable cybersecurity SME plugin. Strict RAG over ChromaDB, "
            "with LangGraph reasoning and verifiable citations."
        ),
        version="0.1.0",
    )

    # CORS for local Vite dev server
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Eagerly compile LangGraph and standard LLM so startup failures are obvious
    try:
        graph = make_graph()
        raw_llm = build_llm()
    except Exception as exc:  # pragma: no cover - startup guardrail
        raise RuntimeError(
            "Failed to initialise LangGraph / vector store. "
            "Check that ChromaDB is populated and LLM credentials are set."
        ) from exc

    @app.post("/api/ask-expert", response_model=AskResponse)
    async def ask_expert(payload: AskRequest) -> AskResponse:
        """Main entrypoint for the frontend to query the SME."""

        # ---------------------------------------------------------
        # BRANCH A: Generic LLM (Hallucination Risk for Demo)
        # ---------------------------------------------------------
        if payload.plugin == "none":
            try:
                # Ask the raw LLM with no context, no RAG, and no strict rules
                response = raw_llm.invoke(payload.question)
                answer = response.content if hasattr(response, "content") else str(response)
                
                return AskResponse(
                    answer=answer,
                    citations=[],
                    steps=[StepLog(node="ROUTING", status="ok", detail="Base Model Only")]
                )
            except Exception as exc:
                raise HTTPException(status_code=500, detail=f"Standard LLM failed: {str(exc)}") from exc

        # ---------------------------------------------------------
        # BRANCH B: SME-Plug (Strict RAG & Decision Tree)
        # ---------------------------------------------------------
        # In Branch B of ask_expert:
        initial_state: SMEState = {
            "question": payload.question,
            "plugin_mode": payload.plugin, # Pass the folder name here
            "steps": [],
        }

        try:
            result: SMEState = graph.invoke(initial_state)
        except Exception as exc:
            # Never leak stack traces to the user; keep it clean for the demo.
            raise HTTPException(
                status_code=500,
                detail="The SME-Plug backend failed while processing this question.",
            ) from exc

        answer: Optional[str] = result.get("answer")  # type: ignore[assignment]
        citations: List[str] = list(result.get("citations") or [])
        raw_steps: List[Dict[str, Any]] = list(result.get("steps") or [])

        if answer is None:
            raise HTTPException(
                status_code=500,
                detail="Internal Error: graph returned no answer.",
            )

        steps = [StepLog(**step) for step in raw_steps]
        return AskResponse(answer=answer, citations=citations, steps=steps)

    @app.get("/api/health", tags=["health"])
    async def health() -> Dict[str, Any]:
        """Simple healthcheck to verify backend wiring."""
        return {
            "status": "ok",
            "llm_provider": settings.llm_provider,
            "chroma_db_dir": str(settings.chroma_db_dir),
        }

    return app


app = create_app()