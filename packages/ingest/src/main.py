"""Main ingest script."""

import argparse
import os
from pathlib import Path

import chromadb
from dotenv import load_dotenv

# Load .env from project root
_project_root = Path(__file__).parents[3]
load_dotenv(_project_root / ".env")

from .config import load_config, get_collection_name, get_repos
from .embeddings import get_embedding_function
from .github import fetch_repo
from .chunker import chunk_text, generate_chunk_id, extract_metadata, detect_language
from .recorder import load_records, check_should_process, batch_save_records


def get_client(config: dict) -> chromadb.ClientAPI:
    """Get ChromaDB persistent client."""
    path = config["chromadb"]["path"]
    return chromadb.PersistentClient(path=path)


def create_collection(client: chromadb.ClientAPI, name: str, embed_fn, config: dict):
    """Create or get collection with embedding function."""
    return client.get_or_create_collection(
        name=name,
        embedding_function=embed_fn,
        configuration={"hnsw": {"space": "cosine"}},
        metadata={
            "embedding_provider": config["embedding"]["provider"],
            "embedding_model": config["embedding"]["model"],
        }
    )


def ingest_repo(
    repo_name: str,
    repo_config: dict,
    collection,
    config: dict,
    force: bool = False,
) -> dict:
    """Ingest a single repo.

    Returns stats: {processed, skipped, chunks, errors}
    """
    stats = {"processed": 0, "skipped": 0, "chunks": 0, "errors": 0}

    # Get chunking config (separate for docs and code)
    chunking_config = config["chunking"]
    language = repo_config.get("language")

    # Fetch files from GitHub
    try:
        files = fetch_repo(repo_config)
    except Exception as e:
        print(f"  Error fetching repo: {e}")
        stats["errors"] = 1
        return stats

    # Load records once (batch mode)
    records = load_records(repo_name) if not force else {}
    records_modified = False

    # Process each file
    for file in files:
        path = file["path"]
        content = file["content"]
        sha = file["sha"]

        # Chunk the file first (to get chunk_count for comparison)
        lang = detect_language(path)
        if lang in ("python", "javascript", "typescript"):
            cfg = chunking_config["code"]
        else:
            cfg = chunking_config["docs"]
        chunks = chunk_text(content, cfg["chunk_size"], cfg["chunk_overlap"], file_path=path)
        if not chunks:
            continue

        chunk_count = len(chunks)

        # Check if should process (using in-memory records)
        if not force:
            if not check_should_process(records, path, sha, chunk_count):
                stats["skipped"] += 1
                continue

            # Delete old chunks by filePath metadata (if file existed before)
            if path in records:
                file_path_key = f"{repo_name}/{path}"
                try:
                    collection.delete(where={"filePath": file_path_key})
                except Exception:
                    pass

        # Prepare documents
        metadata = extract_metadata(repo_name, path, language)

        ids = []
        documents = []
        metadatas = []

        for i, chunk in enumerate(chunks):
            chunk_id = generate_chunk_id()
            ids.append(chunk_id)
            documents.append(chunk)
            metadatas.append(metadata)

        # Upsert to collection
        try:
            collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
            # Update in-memory records (store sha and chunk_count only)
            records[path] = {"sha": sha, "chunk_count": chunk_count}
            records_modified = True
            stats["processed"] += 1
            stats["chunks"] += chunk_count
        except Exception as e:
            print(f"  Error processing {path}: {e}")
            stats["errors"] += 1

    # Save records once at the end (batch mode)
    if records_modified:
        batch_save_records(repo_name, records)

    return stats


def main():
    parser = argparse.ArgumentParser(description="Ingest documents into ChromaDB")
    parser.add_argument("repos", nargs="*", help="Repos to ingest (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Dry run mode")
    parser.add_argument("--list", action="store_true", help="List available repos")
    parser.add_argument("--force", action="store_true", help="Force re-ingest all files")
    args = parser.parse_args()

    config = load_config()
    repos = get_repos(config)

    if args.list:
        print("Available repos:")
        for name, repo in repos.items():
            lang = repo.get("language", "docs")
            print(f"  {name} ({lang}) -> {get_collection_name(name, config)}")
        return

    # Filter repos if specified
    repo_names = args.repos if args.repos else list(repos.keys())

    print(f"Provider: {config['embedding']['provider']}")
    print(f"Model: {config['embedding']['model']}")
    print(f"Repos: {', '.join(repo_names)}")

    if args.dry_run:
        print("\nDry run - collections to create:")
        for name in repo_names:
            print(f"  {get_collection_name(name, config)}")
        return

    # Connect to ChromaDB
    client = get_client(config)
    embed_fn = get_embedding_function(config)

    total_stats = {"processed": 0, "skipped": 0, "chunks": 0, "errors": 0}

    # Process each repo
    for name in repo_names:
        if name not in repos:
            print(f"Warning: unknown repo '{name}', skipping")
            continue

        print(f"\n--- {name} ---")
        collection_name = get_collection_name(name, config)
        collection = create_collection(client, collection_name, embed_fn, config)

        stats = ingest_repo(name, repos[name], collection, config, args.force)

        for k in total_stats:
            total_stats[k] += stats[k]

        print(f"  Processed: {stats['processed']}, Skipped: {stats['skipped']}, Chunks: {stats['chunks']}")

    print(f"\n=== Total ===")
    print(f"Processed: {total_stats['processed']}")
    print(f"Skipped: {total_stats['skipped']}")
    print(f"Chunks: {total_stats['chunks']}")
    print(f"Errors: {total_stats['errors']}")


if __name__ == "__main__":
    main()
