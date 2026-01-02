# LangChain MCP

MCP server for searching LangChain documentation and source code.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Claude Desktop │────▶│  @langchain-mcp/server│────▶│   API Server    │
│                 │     │  (npm package)        │     │   (VPS)         │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
```

## Project Structure

```
langchain-MCP/
├── config/
│   └── settings.json           # Shared configuration
├── packages/
│   ├── ingest/                 # Python - Data ingestion (uv)
│   ├── api/                    # TypeScript - API server (Express)
│   ├── mcp-server/             # TypeScript - MCP client (npm publish)
│   └── mcp-server-local/       # TypeScript - Local MCP server (dev)
```

## For Users

### Installation

```bash
npm install -g @langchain-mcp/server
langchain-mcp login
```

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "langchain-mcp": {
      "command": "npx",
      "args": ["@langchain-mcp/server"]
    }
  }
}
```

### CLI Commands

```bash
langchain-mcp login      # Login via Google
langchain-mcp status     # Check usage and credits
langchain-mcp logout     # Logout
```

## For Developers

### 1. Ingest Data

```bash
cd packages/ingest
uv sync
uv run ingest --list     # List repos
uv run ingest docs       # Ingest docs only
uv run ingest            # Ingest all
```

### 2. Run API Server

```bash
cd packages/api
npm install
npm run dev
```

### 3. Test Local MCP Server

```bash
cd packages/mcp-server-local
npm install
npm run dev
```

## Configuration

All settings in `config/settings.json`:

```json
{
  "embedding": {
    "provider": "openrouter",
    "model": "qwen/qwen3-embedding-8b"
  },
  "chromadb": {
    "path": "./data/chroma"
  },
  "chunking": {
    "chunk_size": 1500,
    "chunk_overlap": 150
  },
  "repos": { ... }
}
```

### Embedding Providers

Supported: `sentence-transformer`, `openai`, `cohere`, `google`, `ollama`, `openrouter`

See: https://docs.trychroma.com/integrations/chroma-integrations

## MCP Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `search_docs` | Search LangChain documentation | `query`, `limit` |
| `search_langchain_code` | Search LangChain source code | `query`, `limit`, `language` (py/js) |
| `search_langgraph_code` | Search LangGraph source code | `query`, `limit`, `language` (py/js) |
| `search_deepagent_code` | Search DeepAgent source code | `query`, `limit`, `language` (py/js) |

## Pricing

- **Free credits**: $5 per new user (~2000 searches)
- **Cost**: $0.0005 per 1K tokens
- **Donation bonus**: Donate $5, get $10 credits (200%)

## Roadmap

- [ ] Rate limiting (per user / per IP)
- [ ] More embedding models
- [ ] Local mode (no API key required)

## License

MIT
