import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { searchDocsSchema, searchDocs } from './tools/search-docs.js';
import { searchCodeSchema, searchCode } from './tools/search-code.js';
import { searchHybridSchema, searchHybrid } from './tools/search-hybrid.js';

/**
 * Create and configure the MCP server with all tools.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'langchain-rag-server',
    version: '1.0.0',
  });

  // Register search_langchain_docs tool
  server.tool(
    'search_langchain_docs',
    'Search LangChain documentation. Returns relevant docs based on your query.',
    searchDocsSchema.shape,
    async (input) => {
      try {
        const result = await searchDocs(searchDocsSchema.parse(input));
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // Register search_langchain_code tool
  server.tool(
    'search_langchain_code',
    'Search LangChain source code. Find functions, classes, and code snippets.',
    searchCodeSchema.shape,
    async (input) => {
      try {
        const result = await searchCode(searchCodeSchema.parse(input));
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  // Register search_langchain tool (hybrid)
  server.tool(
    'search_langchain',
    'Search all LangChain resources (docs + code). Use for comprehensive searches.',
    searchHybridSchema.shape,
    async (input) => {
      try {
        const result = await searchHybrid(searchHybridSchema.parse(input));
        return { content: [{ type: 'text', text: result }] };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * Start the MCP server.
 */
export async function startServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LangChain RAG MCP Server started');
}
