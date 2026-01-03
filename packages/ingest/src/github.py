"""GitHub file fetcher."""

import fnmatch
import hashlib
import io
import zipfile
import httpx


def get_extensions(language: str | None) -> list[str]:
    """Get file extensions for language."""
    if language == "python":
        return [".py"]
    elif language == "javascript":
        return [".ts", ".tsx", ".js", ".jsx"]
    else:
        return [".md", ".mdx"]


def matches_patterns(path: str, patterns: list[str]) -> bool:
    """Check if path matches any glob pattern."""
    for pattern in patterns:
        if fnmatch.fnmatch(path, pattern):
            return True
    return False


def fetch_repo(repo_config: dict) -> list[dict]:
    """Fetch files from GitHub repo.

    Returns list of {"path": str, "content": str}
    """
    owner = repo_config["owner"]
    repo = repo_config["repo"]
    branch = repo_config["branch"]
    include = repo_config.get("include", ["**/*"])
    exclude = repo_config.get("exclude", [])
    language = repo_config.get("language")

    extensions = get_extensions(language)

    # Download ZIP
    url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
    print(f"  Downloading {owner}/{repo}@{branch}...")

    resp = httpx.get(url, follow_redirects=True, timeout=120.0)
    resp.raise_for_status()

    # Extract files
    files = []
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        # ZIP has prefix like "repo-branch/"
        prefix = f"{repo}-{branch}/"

        for name in zf.namelist():
            if not name.startswith(prefix):
                continue

            # Get path relative to repo root
            path = name[len(prefix):]
            if not path or name.endswith("/"):
                continue

            # Check extension
            if not any(path.endswith(ext) for ext in extensions):
                continue

            # Check include patterns
            if not matches_patterns(path, include):
                continue

            # Check exclude patterns
            if matches_patterns(path, exclude):
                continue

            # Read content
            try:
                content = zf.read(name).decode("utf-8")
                sha = hashlib.sha256(content.encode()).hexdigest()[:16]
                files.append({"path": path, "content": content, "sha": sha})
            except UnicodeDecodeError:
                continue  # Skip binary files

    print(f"  Found {len(files)} files")
    return files
