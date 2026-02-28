from __future__ import annotations

import sys
from pathlib import Path
from typing import List

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma

from app.config import get_settings
from app.rag import get_embeddings

def discover_pdfs_by_domain(data_dir: Path) -> dict[str, List[Path]]:
    """Scans subfolders and groups PDFs by their parent folder name (the domain)."""
    domain_map = {}
    if not data_dir.exists():
        return domain_map

    for domain_folder in data_dir.iterdir():
        if domain_folder.is_dir():
            domain_name = domain_folder.name
            pdfs = sorted(p for p in domain_folder.glob("**/*.pdf") if p.is_file())
            if pdfs:
                domain_map[domain_name] = pdfs
    return domain_map


def main() -> None:
    settings = get_settings()
    data_dir = settings.pdf_source_dir
    chroma_dir = settings.chroma_db_dir

    print("=== SME-Plug Multi-Domain PDF Ingestion ===")
    print(f"Reading from DATA directory: {data_dir}")

    domain_map = discover_pdfs_by_domain(data_dir)
    
    if not domain_map:
        print(f"[ERROR] No PDFs found in subfolders under '{data_dir}'.")
        print("Ensure you have folders like 'SoftwareEngineer' with PDFs inside.")
        sys.exit(1)

    all_docs = []
    
    for domain_name, pdf_paths in domain_map.items():
        print(f"\n--- Processing Domain: [{domain_name}] ---")
        
        for pdf_path in pdf_paths:
            print(f"[LOAD] {pdf_path.name}")
            loader = PyPDFLoader(str(pdf_path))
            pages = loader.load()
            
            for page in pages:
                md = page.metadata or {}
                md["doc_name"] = pdf_path.stem
                md["domain"] = domain_name 
                
                raw_page = md.get("page", 0)
                try:
                    page_number = int(raw_page) + 1
                except Exception:
                    page_number = raw_page or "?"
                md["page_number"] = page_number
                page.metadata = md

            splitter = RecursiveCharacterTextSplitter(
                chunk_size=2000,
                chunk_overlap=400,
                separators=["\n\n", "\n", ".", " "],
            )
            chunks = splitter.split_documents(pages)
            print(f"  - Generated {len(chunks)} chunks tagged with domain '{domain_name}'.")
            
            all_docs.extend(chunks)

    print(f"\n[INFO] Total multi-domain chunks to store: {len(all_docs)}")
    chroma_dir.mkdir(parents=True, exist_ok=True)

    embeddings = get_embeddings()
    print("[INFO] Building ChromaDB index... this may take a minute.")

    vectorstore = Chroma(
        collection_name=settings.chroma_collection_name,
        embedding_function=embeddings,
        persist_directory=str(chroma_dir),
    )
    
    vectorstore.add_documents(documents=all_docs)

    print("\n=== Multi-Domain Ingestion Complete ===")
    print(f"ChromaDB persisted at: {chroma_dir}")

if __name__ == "__main__":
    main()