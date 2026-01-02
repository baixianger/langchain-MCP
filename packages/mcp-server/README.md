# langchain-mcp

MCP server for searching LangChain, LangGraph & LangSmith documentation and source code.

## Installation

```bash
npm i -g langchain-mcp
langchain-mcp login
claude mcp add langchain-mcp -- npx langchain-mcp
```

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "langchain-mcp": {
      "command": "npx",
      "args": ["langchain-mcp"]
    }
  }
}
```

## CLI Commands

```bash
langchain-mcp login    # Login with GitHub/Google
langchain-mcp status   # Check login status and usage
langchain-mcp logout   # Logout
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_langchain_docs` | Search documentation |
| `search_langchain_code` | Search source code |
| `search_langchain` | Hybrid search (docs + code) |

## Free Credits

New users get **$5 free credits** (~150 searches).

## Links

- Website: https://langchain-mcp.xyz
- GitHub: https://github.com/baixianger/langchain-mcp
- Sponsor: https://github.com/sponsors/baixianger

## License

MIT
