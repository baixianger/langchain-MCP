"""File processing recorder for incremental ingestion (per-repo).

Records structure:
{
    "file_path": {"sha": "abc123", "chunk_count": 5},
    ...
}

A file needs re-processing if:
- It's new (not in records)
- SHA changed (content modified)
- chunk_count differs (previous ingest may have been interrupted)
"""

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


def check_should_process(records: dict, file_path: str, sha: str, chunk_count: int) -> bool:
    """Check if file should be processed (uses in-memory records).

    Returns True if file needs processing:
    - New file (not in records)
    - SHA changed (content modified)
    - chunk_count differs (previous ingest may have been interrupted)
    """
    record = records.get(file_path)
    if record is None:
        return True  # New file
    if record["sha"] != sha:
        return True  # Content changed
    if record.get("chunk_count") != chunk_count:
        return True  # Chunk count mismatch (possible incomplete ingest)
    return False  # Unchanged, skip


def batch_save_records(repo_name: str, records: dict):
    """Save all records for a repo (batch save)."""
    save_records(repo_name, records)
