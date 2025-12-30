# LangChain RAG MCP Server

MCP server for RAG over LangChain documentation and source code.

## Setup

```bash
# Install
npm install

# Start ChromaDB (requires Python)
pip install chromadb
chroma run --path ./data/chroma

# Configure (copy and edit)
cp .env.example .env
```

## Usage

```bash
# Ingest (test with docs first)
npm run ingest docs

# Start MCP server
npm run dev
```

## MCP Tools

- `search_langchain_docs` - Search documentation
- `search_langchain_code` - Search source code
- `search_langchain` - Search both (hybrid)

## Collections

Filter by: `docs`, `langchain`, `langchainjs`, `langgraph`, `langgraphjs`, `deepagents`, `deepagentsjs`

## Embedding Providers

Set `EMBEDDING_PROVIDER` in `.env`:

**ChromaDB integrations** (install only what you need):

| Provider | Package | Default Model |
|----------|---------|---------------|
| `default` | @chroma-core/default-embed | all-MiniLM-L6-v2 |
| `sentence-transformer` | @chroma-core/sentence-transformer | all-MiniLM-L6-v2 |
| `openai` | @chroma-core/openai | text-embedding-3-small |
| `cohere` | @chroma-core/cohere | embed-english-v3.0 |
| `jina` | @chroma-core/jina | jina-embeddings-v3 |
| `voyageai` | @chroma-core/voyageai | voyage-2 |
| `ollama` | @chroma-core/ollama | nomic-embed-text |
| `google-genai` | @chroma-core/google-genai | text-embedding-004 |
| `huggingface` | @chroma-core/huggingface | sentence-transformers/all-MiniLM-L6-v2 |

**External API** (default):

| Provider | API Key | Default Model |
|----------|---------|---------------|
| `openrouter` | OPENROUTER_API_KEY | qwen/qwen3-embedding-8b |
