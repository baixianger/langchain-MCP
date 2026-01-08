import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { APIClient, SearchResult } from './api-client.js';
import {
  LangGraphClient,
  DEFAULT_LANGGRAPH_URL,
  Thread,
  ThreadState,
  Run,
  RunDetails,
} from './langgraph-client.js';

// Schemas
const searchDocsSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().int().min(1).max(20).default(5).describe('Max results (1-20)'),
});

const searchCodeSchema = z.object({
  query: z.string().describe('Search query'),
  limit: z.number().int().min(1).max(20).default(5).describe('Max results (1-20)'),
  language: z.enum(['python', 'javascript']).optional().describe('Filter by language'),
});

function formatDocsResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  return results.map((r, i) => {
    const meta = r.metadata;
    const header = `## ${i + 1}. ${meta.filePath}`;
    const info = [
      meta.product && `Product: ${meta.product}`,
      meta.language && `Language: ${meta.language}`,
      meta.topic && `Topic: ${meta.topic}`,
    ].filter(Boolean).join(' | ');

    const content = r.content.length > 1500 ? r.content.slice(0, 1500) + '...' : r.content;

    return `${header}\n${info}\n\n${content}`;
  }).join('\n\n---\n\n');
}

function formatCodeResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return 'No results found.';
  }

  return results.map((r, i) => {
    const meta = r.metadata;
    const lang = meta.language === 'python' || meta.language === 'py' ? 'python' : 'typescript';
    const header = `## ${i + 1}. ${meta.filePath}`;
    const info = [
      meta.codeType && `Type: ${meta.codeType}`,
      meta.product && `Product: ${meta.product}`,
    ].filter(Boolean).join(' | ');

    const content = r.content.length > 2000 ? r.content.slice(0, 2000) + '...' : r.content;

    return `${header}\n${info}\n\n\`\`\`${lang}\n${content}\n\`\`\``;
  }).join('\n\n---\n\n');
}

const LOGIN_MESSAGE = `## Not logged in

Please login first by running this command in your terminal:

\`\`\`bash
langchain-mcp login
\`\`\`

This will open a browser for Google authentication.
After logging in, restart Claude to use the LangChain MCP tools.

For more info: https://langchain-mcp.xyz`;

// LangGraph Schemas
const langgraphListThreadsSchema = z.object({
  server_url: z.string().url().default(DEFAULT_LANGGRAPH_URL)
    .describe('LangGraph dev server URL (default: http://localhost:2024)'),
  limit: z.number().int().min(1).max(100).default(10)
    .describe('Number of threads to return (1-100)'),
  offset: z.number().int().min(0).default(0)
    .describe('Offset for pagination'),
  status: z.enum(['idle', 'busy', 'interrupted', 'error']).optional()
    .describe('Filter by thread status'),
});

const langgraphGetThreadSchema = z.object({
  server_url: z.string().url().default(DEFAULT_LANGGRAPH_URL)
    .describe('LangGraph dev server URL'),
  thread_id: z.string().describe('Thread ID to retrieve'),
});

const langgraphGetThreadStateSchema = z.object({
  server_url: z.string().url().default(DEFAULT_LANGGRAPH_URL)
    .describe('LangGraph dev server URL'),
  thread_id: z.string().describe('Thread ID to get state for'),
});

const langgraphListRunsSchema = z.object({
  server_url: z.string().url().default(DEFAULT_LANGGRAPH_URL)
    .describe('LangGraph dev server URL'),
  thread_id: z.string().describe('Thread ID to list runs for'),
  limit: z.number().int().min(1).max(100).default(10)
    .describe('Number of runs to return (1-100)'),
});

const langgraphGetRunSchema = z.object({
  server_url: z.string().url().default(DEFAULT_LANGGRAPH_URL)
    .describe('LangGraph dev server URL'),
  thread_id: z.string().describe('Thread ID'),
  run_id: z.string().describe('Run ID to retrieve'),
});

// LangGraph Formatting Functions
function formatThreadsList(threads: Thread[]): string {
  if (threads.length === 0) {
    return 'No threads found.';
  }

  const header = `## Threads (${threads.length} total)\n\n`;
  const items = threads.map((t, i) => {
    const created = new Date(t.created_at).toLocaleString();
    const updated = new Date(t.updated_at).toLocaleString();
    return [
      `### ${i + 1}. \`${t.thread_id}\``,
      `Status: **${t.status}** | Created: ${created}`,
      `Last updated: ${updated}`,
      t.metadata && Object.keys(t.metadata).length > 0
        ? `Metadata: ${JSON.stringify(t.metadata)}`
        : null,
    ].filter(Boolean).join('\n');
  }).join('\n\n');

  return header + items;
}

function formatThread(thread: Thread): string {
  const created = new Date(thread.created_at).toLocaleString();
  const updated = new Date(thread.updated_at).toLocaleString();

  let output = [
    `## Thread: \`${thread.thread_id}\``,
    '',
    `**Status:** ${thread.status}`,
    `**Created:** ${created}`,
    `**Updated:** ${updated}`,
  ];

  if (thread.metadata && Object.keys(thread.metadata).length > 0) {
    output.push('', '### Metadata', '```json', JSON.stringify(thread.metadata, null, 2), '```');
  }

  if (thread.values && Object.keys(thread.values).length > 0) {
    output.push('', '### Current Values', '```json', JSON.stringify(thread.values, null, 2), '```');
  }

  return output.join('\n');
}

function formatThreadState(state: ThreadState, threadId: string): string {
  let output = [
    `## Thread State: \`${threadId}\``,
    '',
    `**Checkpoint:** ${state.checkpoint?.checkpoint_id || 'none'}`,
    `**Created:** ${new Date(state.created_at).toLocaleString()}`,
  ];

  if (state.next && state.next.length > 0) {
    output.push(`**Next nodes:** ${state.next.join(', ')}`);
  }

  if (state.values && Object.keys(state.values).length > 0) {
    output.push('', '### State Values', '```json', JSON.stringify(state.values, null, 2), '```');
  }

  if (state.tasks && state.tasks.length > 0) {
    output.push('', '### Tasks');
    state.tasks.forEach((task, i) => {
      output.push(`${i + 1}. **${task.name}** (${task.id})`);
      if (task.error) {
        output.push(`   Error: ${task.error}`);
      }
      if (task.interrupts && task.interrupts.length > 0) {
        output.push(`   Interrupts: ${task.interrupts.length}`);
      }
    });
  }

  return output.join('\n');
}

function formatRunsList(runs: Run[], threadId: string): string {
  if (runs.length === 0) {
    return `No runs found for thread \`${threadId}\`.`;
  }

  const header = `## Runs for Thread \`${threadId}\` (${runs.length} total)\n\n`;
  const items = runs.map((r, i) => {
    const created = new Date(r.created_at).toLocaleString();
    const updated = new Date(r.updated_at).toLocaleString();
    return [
      `### ${i + 1}. \`${r.run_id}\``,
      `Status: **${r.status}** | Assistant: ${r.assistant_id}`,
      `Created: ${created} | Updated: ${updated}`,
    ].join('\n');
  }).join('\n\n');

  return header + items;
}

function formatRunDetails(run: RunDetails): string {
  const created = new Date(run.created_at).toLocaleString();
  const updated = new Date(run.updated_at).toLocaleString();

  let output = [
    `## Run: \`${run.run_id}\``,
    '',
    `**Thread:** ${run.thread_id}`,
    `**Assistant:** ${run.assistant_id}`,
    `**Status:** ${run.status}`,
    `**Created:** ${created}`,
    `**Updated:** ${updated}`,
  ];

  if (run.error) {
    output.push('', '### Error', '```', run.error, '```');
  }

  if (run.input && Object.keys(run.input).length > 0) {
    output.push('', '### Input', '```json', JSON.stringify(run.input, null, 2), '```');
  }

  if (run.output && Object.keys(run.output).length > 0) {
    output.push('', '### Output', '```json', JSON.stringify(run.output, null, 2), '```');
  }

  if (run.kwargs && Object.keys(run.kwargs).length > 0) {
    output.push('', '### Additional Arguments', '```json', JSON.stringify(run.kwargs, null, 2), '```');
  }

  return output.join('\n');
}

export function createServer(): McpServer {
  const config = loadConfig();
  const isLoggedIn = !!config;
  const apiClient = isLoggedIn ? new APIClient(config.api_url, config.api_key) : null;

  const server = new McpServer({
    name: 'langchain-mcp',
    version: '1.2.7',
  });

  // search_docs
  server.tool(
    'search_docs',
    'Search documentation, references, and tutorials about LangChain, LangGraph, LangSmith, and DeepAgents.',
    searchDocsSchema.shape,
    async (input) => {
      if (!apiClient) {
        return { content: [{ type: 'text', text: LOGIN_MESSAGE }] };
      }
      try {
        const params = searchDocsSchema.parse(input);
        const response = await apiClient.searchDocs(params);

        const formatted = formatDocsResults(response.results);
        const footer = `\n\n---\n_${response.results.length} results | ${response.usage.tokens_used} tokens | $${response.usage.credits_remaining.toFixed(2)} remaining_`;

        return {
          content: [{ type: 'text', text: formatted + footer }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // search_langchain_code
  server.tool(
    'search_langchain_code',
    'Search LangChain source code. Returns relevant code snippets.',
    searchCodeSchema.shape,
    async (input) => {
      if (!apiClient) {
        return { content: [{ type: 'text', text: LOGIN_MESSAGE }] };
      }
      try {
        const params = searchCodeSchema.parse(input);
        const response = await apiClient.searchLangchainCode(params);

        const formatted = formatCodeResults(response.results);
        const footer = `\n\n---\n_${response.results.length} results | ${response.usage.tokens_used} tokens | $${response.usage.credits_remaining.toFixed(2)} remaining_`;

        return {
          content: [{ type: 'text', text: formatted + footer }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // search_langgraph_code
  server.tool(
    'search_langgraph_code',
    'Search LangGraph source code. Returns relevant code snippets.',
    searchCodeSchema.shape,
    async (input) => {
      if (!apiClient) {
        return { content: [{ type: 'text', text: LOGIN_MESSAGE }] };
      }
      try {
        const params = searchCodeSchema.parse(input);
        const response = await apiClient.searchLanggraphCode(params);

        const formatted = formatCodeResults(response.results);
        const footer = `\n\n---\n_${response.results.length} results | ${response.usage.tokens_used} tokens | $${response.usage.credits_remaining.toFixed(2)} remaining_`;

        return {
          content: [{ type: 'text', text: formatted + footer }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // search_deepagents_code
  server.tool(
    'search_deepagents_code',
    'Search DeepAgents source code. Returns relevant code snippets.',
    searchCodeSchema.shape,
    async (input) => {
      if (!apiClient) {
        return { content: [{ type: 'text', text: LOGIN_MESSAGE }] };
      }
      try {
        const params = searchCodeSchema.parse(input);
        const response = await apiClient.searchDeepagentsCode(params);

        const formatted = formatCodeResults(response.results);
        const footer = `\n\n---\n_${response.results.length} results | ${response.usage.tokens_used} tokens | $${response.usage.credits_remaining.toFixed(2)} remaining_`;

        return {
          content: [{ type: 'text', text: formatted + footer }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ==================== LangGraph Debugging Tools ====================

  // langgraph_list_threads
  server.tool(
    'langgraph_list_threads',
    'List conversation threads from a local LangGraph dev server. Use this to find threads to debug. Requires a running LangGraph server (langgraph dev).',
    langgraphListThreadsSchema.shape,
    async (input) => {
      try {
        const params = langgraphListThreadsSchema.parse(input);
        const client = new LangGraphClient(params.server_url);
        const threads = await client.listThreads({
          limit: params.limit,
          offset: params.offset,
          status: params.status,
        });
        return {
          content: [{ type: 'text', text: formatThreadsList(threads) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // langgraph_get_thread
  server.tool(
    'langgraph_get_thread',
    'Get detailed information about a specific thread including its current values and metadata.',
    langgraphGetThreadSchema.shape,
    async (input) => {
      try {
        const params = langgraphGetThreadSchema.parse(input);
        const client = new LangGraphClient(params.server_url);
        const thread = await client.getThread(params.thread_id);
        return {
          content: [{ type: 'text', text: formatThread(thread) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // langgraph_get_thread_state
  server.tool(
    'langgraph_get_thread_state',
    'Get the current state/checkpoint of a thread, including state values, pending tasks, and next nodes.',
    langgraphGetThreadStateSchema.shape,
    async (input) => {
      try {
        const params = langgraphGetThreadStateSchema.parse(input);
        const client = new LangGraphClient(params.server_url);
        const state = await client.getThreadState(params.thread_id);
        return {
          content: [{ type: 'text', text: formatThreadState(state, params.thread_id) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // langgraph_list_runs
  server.tool(
    'langgraph_list_runs',
    'List runs (executions) for a specific thread. Use this to find specific runs to inspect.',
    langgraphListRunsSchema.shape,
    async (input) => {
      try {
        const params = langgraphListRunsSchema.parse(input);
        const client = new LangGraphClient(params.server_url);
        const runs = await client.listRuns(params.thread_id, { limit: params.limit });
        return {
          content: [{ type: 'text', text: formatRunsList(runs, params.thread_id) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // langgraph_get_run
  server.tool(
    'langgraph_get_run',
    'Get detailed trace information for a specific run, including input, output, and execution details.',
    langgraphGetRunSchema.shape,
    async (input) => {
      try {
        const params = langgraphGetRunSchema.parse(input);
        const client = new LangGraphClient(params.server_url);
        const run = await client.getRun(params.thread_id, params.run_id);
        return {
          content: [{ type: 'text', text: formatRunDetails(run) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${(error as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}
