import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { APIClient, SearchResult } from './api-client.js';

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

  return server;
}
