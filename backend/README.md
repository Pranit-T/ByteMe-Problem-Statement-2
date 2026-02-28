# SME-Plug Backend (FastAPI + LangGraph + ChromaDB)

This backend powers the **SME-Plug** Cybersecurity Compliance expert. It exposes a simple REST API, uses **ChromaDB** for RAG, and runs a **LangGraph** state machine to strictly control reasoning.

## Quick Start

### 1. Create & activate a virtualenv

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # On Windows
source .venv/bin/activate  # On macOS/Linux
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set environment variables

At minimum, set an LLM provider and key (pick **one**):

```bash
# For OpenAI GPT-4o / gpt-4o-mini
set OPENAI_API_KEY=sk-...
set LLM_PROVIDER=openai

# OR for Gemini 1.5 Pro
set GOOGLE_API_KEY=your-google-api-key
set LLM_PROVIDER=gemini
```

You can also use a `.env` file in `backend/`:

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
CHROMA_DB_DIR=./data/chroma
PDF_SOURCE_DIR=./data/pdfs
```

### 4. Ingest cybersecurity PDFs into ChromaDB

1. Drop your ISO‑27001 / NIST / SOC2 PDFs into:

   - `backend/data/pdfs`

2. Run the ingestion script:

```bash
cd backend
python -m scripts.ingest_pdfs
```

This will:

- Parse PDFs into pages
- Chunk content
- Store embeddings in a persistent **ChromaDB** database at `./data/chroma`

### 5. Run the FastAPI server

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

The main endpoint is:

- `POST /api/ask-expert`

Request body:

```json
{ "question": "What are ISO‑27001 access control requirements?" }
```

Response body (example):

```json
{
  "answer": "...",
  "citations": [
    "[Source: ISO_27001, Page 12]",
    "[Source: ISO_27001, Page 13]"
  ],
  "steps": [
    { "node": "retrieve_docs", "status": "ok", "detail": "Retrieved 5 chunks from ChromaDB" },
    { "node": "verify_context", "status": "ok", "detail": "Top score 0.21 above threshold 0.3" },
    { "node": "format_output", "status": "ok", "detail": "LLM generated answer with citations" }
  ]
}
```

### 6. Connect from the React frontend

- The React app should `POST` to `http://localhost:8000/api/ask-expert`
- Display:
  - `answer` in the chat window
  - `citations` as badges / chips
  - `steps` as a LangGraph‑style debug timeline

