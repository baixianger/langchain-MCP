"""Simple text chunker."""

import hashlib
import re


def chunk_text(
    content: str,
    chunk_size: int = 1500,
    chunk_overlap: int = 150,
) -> list[str]:
    """Split text into chunks with overlap.

    Uses simple paragraph/line splitting.
    """
    # Normalize whitespace
    content = content.strip()
    if not content:
        return []

    # If small enough, return as single chunk
    if len(content) <= chunk_size:
        return [content]

    # Split by paragraphs first, then by lines
    paragraphs = re.split(r'\n\n+', content)

    chunks = []
    current_chunk = ""

    for para in paragraphs:
        # If adding this paragraph exceeds chunk size
        if len(current_chunk) + len(para) + 2 > chunk_size:
            if current_chunk:
                chunks.append(current_chunk.strip())
                # Keep overlap from end of current chunk
                overlap_text = current_chunk[-chunk_overlap:] if len(current_chunk) > chunk_overlap else current_chunk
                current_chunk = overlap_text + "\n\n" + para
            else:
                # Paragraph itself is too large, split by lines
                lines = para.split('\n')
                for line in lines:
                    if len(current_chunk) + len(line) + 1 > chunk_size:
                        if current_chunk:
                            chunks.append(current_chunk.strip())
                            overlap_text = current_chunk[-chunk_overlap:] if len(current_chunk) > chunk_overlap else current_chunk
                            current_chunk = overlap_text + "\n" + line
                        else:
                            # Line too large, force split
                            chunks.append(line[:chunk_size])
                            current_chunk = line[chunk_size - chunk_overlap:]
                    else:
                        current_chunk += "\n" + line if current_chunk else line
        else:
            current_chunk += "\n\n" + para if current_chunk else para

    if current_chunk.strip():
        chunks.append(current_chunk.strip())

    return chunks


def generate_chunk_id(repo_name: str, file_path: str, chunk_index: int) -> str:
    """Generate unique chunk ID."""
    key = f"{repo_name}/{file_path}#{chunk_index}"
    return hashlib.md5(key.encode()).hexdigest()[:12]


def extract_metadata(repo_name: str, file_path: str, language: str | None) -> dict:
    """Extract metadata from file path."""
    # Extract topic from filename
    filename = file_path.split("/")[-1]
    topic = filename.rsplit(".", 1)[0] if "." in filename else filename

    # Extract product from path
    product = None
    path_lower = file_path.lower()
    for p in ["langsmith", "langgraph", "langchain", "deepagents"]:
        if p in path_lower:
            product = p
            break

    return {
        "filePath": f"{repo_name}/{file_path}",
        "language": language,
        "product": product,
        "topic": topic,
    }
