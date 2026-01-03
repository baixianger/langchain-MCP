"""File processing recorder for incremental ingestion (per-repo)."""

import json
from pathlib import Path

RECORD_DIR = Path(__file__).parents[3] / "data" / "records"


def _get_record_file(repo_name: str) -> Path:
    """Get record file path for a repo."""
    return RECORD_DIR / f"{repo_name}.json"


def load_records(repo_name: str) -> dict:
    """Load processing records for a repo."""
    record_file = _get_record_file(repo_name)
    if record_file.exists():
        return json.loads(record_file.read_text())
    return {}


def save_records(repo_name: str, records: dict):
    """Save processing records for a repo."""
    RECORD_DIR.mkdir(parents=True, exist_ok=True)
    record_file = _get_record_file(repo_name)
    record_file.write_text(json.dumps(records, indent=2))


def get_file_record(repo_name: str, file_path: str) -> dict | None:
    """Get record for a file."""
    records = load_records(repo_name)
    return records.get(file_path)


def set_file_record(repo_name: str, file_path: str, sha: str, chunk_ids: list[str]):
    """Set record for a file."""
    records = load_records(repo_name)
    records[file_path] = {"sha": sha, "chunk_ids": chunk_ids}
    save_records(repo_name, records)


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
    record_file = _get_record_file(repo_name)
    if record_file.exists():
        record_file.unlink()


# Batch operations for performance
def check_should_process(records: dict, file_path: str, sha: str) -> tuple[bool, list[str]]:
    """Check if file should be processed (uses in-memory records).

    Returns (should_process, old_chunk_ids_to_delete)
    """
    record = records.get(file_path)
    if record is None:
        return True, []  # New file
    if record["sha"] != sha:
        return True, record.get("chunk_ids", [])  # Changed, delete old chunks
    return False, []  # Unchanged, skip


def batch_save_records(repo_name: str, records: dict):
    """Save all records for a repo (batch save)."""
    save_records(repo_name, records)
