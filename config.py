from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field
from dotenv import load_dotenv
# Force Python to read the .env file in the backend folder
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=env_path)
class Settings(BaseModel):
    """Centralised runtime configuration for the SME-Plug backend."""

    # LLM provider selection
    llm_provider: Literal["openai", "gemini", "groq"] = Field(
        default="openai", description="Which LLM provider to use for answers."
    )

    # OpenAI configuration
    openai_api_key: str | None = Field(default=None)
    openai_model: str = Field(default="gpt-4o-mini")

    # Gemini configuration
    google_api_key: str | None = Field(default=None)
    gemini_model: str = Field(default="gemini-2.0-flash")

    # Groq configuration
    groq_api_key: str | None = Field(default=None)
    groq_model: str = Field(default="llama-3.3-70b-versatile")

    # RAG / Chroma configuration
    base_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[1])
    chroma_db_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[1] / "data" / "chroma")
    
    # UPDATE: We now go up two parent directories (app -> backend -> ByteMe) to find the DATA folder
    pdf_source_dir: Path = Field(default_factory=lambda: Path(__file__).resolve().parents[2] / "DATA")
    
    chroma_collection_name: str = Field(default="sme_plug_cybersec")
    top_k: int = Field(default=5)
    similarity_threshold: float = Field(
        default=0.5,
        description=(
            "Maximum cosine distance (lower is better) required to trust a retrieved chunk. "
            "If no chunk is within this threshold, the system will refuse to answer."
        ),
    )

    class Config:
        arbitrary_types_allowed = True


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Load settings from environment variables and sensible defaults."""

    llm_provider = os.getenv("LLM_PROVIDER", "openai").lower()
    
    # Calculate absolute defaults dynamically
    default_base = Path(__file__).resolve().parents[1]
    default_data_dir = Path(__file__).resolve().parents[2] / "DATA"

    settings = Settings(
        llm_provider=llm_provider if llm_provider in {"openai", "gemini", "groq"} else "openai",
        openai_api_key=os.getenv("OPENAI_API_KEY"),
        google_api_key=os.getenv("GOOGLE_API_KEY"),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        base_dir=default_base,
        chroma_db_dir=Path(os.getenv("CHROMA_DB_DIR", "data/chroma")),
        # Use the new ByteMe/DATA path as the default if not provided in an env var
        pdf_source_dir=Path(os.getenv("PDF_SOURCE_DIR", str(default_data_dir))),
    )

    # Normalise paths to be absolute from the correct roots
    if not settings.chroma_db_dir.is_absolute():
        settings.chroma_db_dir = settings.base_dir / settings.chroma_db_dir
        
    if not settings.pdf_source_dir.is_absolute():
        # If a relative path is provided, assume it is relative to the ByteMe root folder
        settings.pdf_source_dir = settings.base_dir.parent / settings.pdf_source_dir

    return settings


__all__ = ["Settings", "get_settings"]