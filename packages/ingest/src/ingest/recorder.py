"""File processing recorder for incremental ingestion."""

import json
from pathlib import Path

RECORD_FILE = Path(__file__).parents[4] / "data" / "ingest_record.json"


def load_records() -> dict:
    """Load processing records."""
    if RECORD_FILE.exists():
        return json.loads(RECORD_FILE.read_text())
    return {}


def save_records(records: dict):
    """Save processing records."""
    RECORD_FILE.parent.mkdir(parents=True, exist_ok=True)
    RECORD_FILE.write_text(json.dumps(records, indent=2))


def get_file_record(repo_name: str, file_path: str) -> dict | None:
    """Get record for a file."""
    records = load_records()
    key = f"{repo_name}/{file_path}"
    return records.get(key)


def set_file_record(repo_name: str, file_path: str, sha: str, chunk_ids: list[str]):
    """Set record for a file."""
    records = load_records()
    key = f"{repo_name}/{file_path}"
    records[key] = {"sha": sha, "chunk_ids": chunk_ids}
    save_records(records)


def should_process(repo_name: str, file_path: str, sha: str) -> tuple[bool, list[str]]:
    """Check if file should be processed.

    Returns (should_process, old_chunk_ids_to_delete)
    """
    record = get_file_record(repo_name, file_path)
    if record is None:
        return True, []  # New file
    if record["sha"] != sha:
        return True, record.get("chunk_ids", [])  # Changed, delete old chunks
    return False, []  # Unchanged, skip


def clear_repo_records(repo_name: str):
    """Clear all records for a repo."""
    records = load_records()
    prefix = f"{repo_name}/"
    records = {k: v for k, v in records.items() if not k.startswith(prefix)}
    save_records(records)
