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
langchain-mcp login    # Login with Google
langchain-mcp status   # Check login status and usage
langchain-mcp logout   # Logout
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `search_docs` | Search documentation, references, and tutorials about LangChain, LangGraph, LangSmith, and DeepAgents |
| `search_langchain_code` | Search LangChain source code |
| `search_langgraph_code` | Search LangGraph source code |
| `search_deepagent_code` | Search DeepAgent source code |

## Free Credits

New users get **$5 free credits** (~2000 searches).

## Links

- Website: https://langchain-mcp.xyz
- GitHub: https://github.com/baixianger/langchain-mcp
- Sponsor: https://ko-fi.com/baixianger

## License

MIT
