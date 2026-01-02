import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env BEFORE importing app (which loads config.ts)
// From dist/index.js: ../../.env = /opt/langchain-mcp/.env (global)
// From dist/index.js: ../.env = /opt/langchain-mcp/api/.env (local override)
config({ path: resolve(__dirname, '../../.env') });
config({ path: resolve(__dirname, '../.env') });

// Dynamic import to ensure env is loaded first
const startServer = async () => {
  const { default: app } = await import('./app.js');
  const { getDatabase } = await import('./db/index.js');

  const PORT = process.env.PORT || 3000;

  // Initialize database
  getDatabase();

  app.listen(PORT, () => {
    console.log(`LangChain MCP API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
};

startServer();
