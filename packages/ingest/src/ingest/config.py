"""Shared config loader."""

import json
from pathlib import Path

_config_cache = None
_project_root = Path(__file__).parents[4]

def get_project_root() -> Path:
    """Get project root directory."""
    return _project_root

def load_config() -> dict:
    """Load config from config/settings.json and resolve paths."""
    global _config_cache
    if _config_cache is not None:
        return _config_cache
    config_path = _project_root / "config" / "settings.json"
    with open(config_path) as f:
        _config_cache = json.load(f)

    # Resolve chromadb path relative to project root
    if "chromadb" in _config_cache and "path" in _config_cache["chromadb"]:
        chroma_path = _config_cache["chromadb"]["path"]
        if chroma_path.startswith("./"):
            _config_cache["chromadb"]["path"] = str(_project_root / chroma_path[2:])

    return _config_cache

def get_collection_name(base_name: str, config: dict = None) -> str:
    """Generate collection name with model suffix.

    Example: docs -> docs_all-MiniLM-L6-v2
    """
    if config is None:
        config = load_config()
    model = config["embedding"]["model"]
    model_suffix = model.replace("/", "-")
    return f"{base_name}_{model_suffix}"

def get_repos(config: dict = None) -> dict:
    """Get repos configuration."""
    if config is None:
        config = load_config()
    return config.get("repos", {})
