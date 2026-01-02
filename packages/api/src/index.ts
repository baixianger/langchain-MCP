import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 优先加载 root .env，然后加载本地 .env (本地覆盖)
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../.env') });
import app from './app.js';
import { getDatabase } from './db/index.js';

const PORT = process.env.PORT || 3000;

// Initialize database
getDatabase();

app.listen(PORT, () => {
  console.log(`LangChain MCP API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
