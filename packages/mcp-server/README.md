<div align="center">

# langchain-mcp

**Give Claude superpowers for LangChain development**

[![npm version](https://badge.fury.io/js/langchain-mcp.svg)](https://www.npmjs.com/package/langchain-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Website](https://langchain-mcp.xyz) · [GitHub](https://github.com/baixianger/langchain-mcp) · [Sponsor](https://ko-fi.com/baixianger)

</div>

---

## Features

### Knowledge Search
Search LangChain, LangGraph, LangSmith & DeepAgents documentation and source code instantly from Claude.

### LangGraph Agent Debugging (New in v2!)
Debug your LangGraph agents like [Polly](https://blog.langchain.com/introducing-polly-your-ai-agent-engineer/) - connect to your local `langgraph dev` server and:
- List threads, runs, and traces
- Inspect agent state and checkpoints
- Ask "Why did this fail?" and get AI-powered analysis
- Get suggestions to improve your agent's prompts

---

## Install

```bash
npm i -g langchain-mcp
langchain-mcp login
claude mcp add langchain-mcp -- langchain-mcp
```

<details>
<summary>Claude Desktop config</summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "langchain-mcp": {
      "command": "langchain-mcp"
    }
  }
}
```

</details>

---

## Tools

### Search (requires login)

| Tool | Description |
|------|-------------|
| `search_docs` | Search documentation and tutorials |
| `search_langchain_code` | Search LangChain source code |
| `search_langgraph_code` | Search LangGraph source code |
| `search_deepagents_code` | Search DeepAgents source code |

### Debug LangGraph Agents (free, no login)

| Tool | Description |
|------|-------------|
| `langgraph_list_threads` | List threads from local server |
| `langgraph_get_thread` | Get thread details |
| `langgraph_get_thread_state` | Get state/checkpoint |
| `langgraph_list_runs` | List runs for a thread |
| `langgraph_get_run` | Get run trace details |

---

## Debug Your Agents

```bash
# Start your LangGraph server
langgraph dev
```

Then ask Claude:
- "List my LangGraph threads"
- "What went wrong with thread abc123?"
- "Summarize the last run"
- "How can I improve this agent?"

Connects to `localhost:2024` by default.

---

## Pricing

| Feature | Cost |
|---------|------|
| Doc/Code Search | $5 free credits (~2000 searches) |
| LangGraph Debugging | **Free forever** |

---

## License

MIT
