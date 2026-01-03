"""Text and code chunker with different strategies."""

import uuid


def detect_language(file_path: str) -> str | None:
    """Detect language from file extension."""
    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""

    if ext == "py":
        return "python"
    elif ext in ("js", "mjs", "cjs"):
        return "javascript"
    elif ext in ("ts", "tsx", "mts"):
        return "typescript"
    elif ext in ("md", "mdx"):
        return "markdown"
    else:
        return None


def chunk_text(
    content: str,
    chunk_size: int = 1500,
    chunk_overlap: int = 150,
    file_path: str | None = None,
) -> list[str]:
    """Split text into chunks based on file type.

    For code (py/js/ts): uses AST-based chunking by function/class.
    For docs (md/mdx): uses fixed-size chunking with overlap.
    """
    lang = detect_language(file_path) if file_path else None

    if lang == "python":
        return chunk_code(content, "python", chunk_size)
    elif lang in ("javascript", "typescript"):
        return chunk_code(content, "javascript", chunk_size)  # ts uses js parser
    else:
        return chunk_docs(content, chunk_size, chunk_overlap)


def chunk_docs(
    content: str,
    chunk_size: int = 1500,
    chunk_overlap: int = 150,
) -> list[str]:
    """Split docs into fixed-size chunks with overlap.

    Simple character-based splitting that respects chunk boundaries.
    """
    content = content.strip()
    if not content:
        return []

    if len(content) <= chunk_size:
        return [content]

    chunks = []
    start = 0

    while start < len(content):
        end = start + chunk_size

        # If not at the end, try to break at a natural boundary
        if end < len(content):
            # Look for paragraph break, then line break, then space
            for sep in ["\n\n", "\n", " "]:
                # Search backwards from end for separator
                sep_pos = content.rfind(sep, start + chunk_size // 2, end)
                if sep_pos > start:
                    end = sep_pos + len(sep)
                    break

        chunk = content[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move start with overlap
        start = end - chunk_overlap if end < len(content) else end

    return chunks


def chunk_code(
    content: str,
    language: str,
    max_chunk_size: int = 4000,
) -> list[str]:
    """Split code into chunks by function/class using tree-sitter.

    Each function or class becomes one chunk. Large chunks are split further.
    """
    try:
        from tree_sitter import Language, Parser

        if language == "python":
            import tree_sitter_python as ts_lang
            target_types = ["function_definition", "class_definition"]
        elif language == "javascript":
            import tree_sitter_javascript as ts_lang
            target_types = [
                "function_declaration",
                "class_declaration",
                "method_definition",
                "arrow_function",
                "export_statement",
            ]
        else:
            # Fallback to docs chunking
            return chunk_docs(content, max_chunk_size, 150)

        lang = Language(ts_lang.language())
        parser = Parser(lang)

        source_bytes = content.encode("utf-8")
        tree = parser.parse(source_bytes)

        def collect_nodes(node, depth=0):
            """Collect function/class nodes from AST."""
            result = []
            if node.type in target_types:
                result.append(node)
            # Don't recurse into nested functions/classes at top level
            elif depth == 0 or node.type not in target_types:
                for child in node.children:
                    result.extend(collect_nodes(child, depth + 1))
            return result

        nodes = collect_nodes(tree.root_node)

        if not nodes:
            # No functions/classes found, use docs chunking
            return chunk_docs(content, max_chunk_size, 150)

        chunks = []
        for node in nodes:
            chunk_content = source_bytes[node.start_byte:node.end_byte].decode("utf-8")

            # If chunk is too large, split it
            if len(chunk_content) > max_chunk_size:
                sub_chunks = chunk_docs(chunk_content, max_chunk_size, 150)
                chunks.extend(sub_chunks)
            else:
                chunks.append(chunk_content)

        return chunks

    except ImportError:
        # tree-sitter not available, fallback
        return chunk_docs(content, max_chunk_size, 150)
    except Exception:
        # Parsing failed, fallback
        return chunk_docs(content, max_chunk_size, 150)


def generate_chunk_id() -> str:
    """Generate unique chunk ID using UUID."""
    return uuid.uuid4().hex[:16]


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
