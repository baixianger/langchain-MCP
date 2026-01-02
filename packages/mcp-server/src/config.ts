import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface UserConfig {
  api_key: string;
  api_url: string;
  user?: {
    id: string;
    email: string;
    name: string | null;
    credits: number;
  };
}

const CONFIG_DIR = join(homedir(), '.config', 'langchain-mcp');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export const DEFAULT_API_URL = process.env.LANGCHAIN_MCP_API_URL || 'https://api.langchain-mcp.xyz';
export const WEBSITE_URL = process.env.LANGCHAIN_MCP_WEBSITE_URL || 'https://langchain-mcp.xyz';

export function loadConfig(): UserConfig | null {
  try {
    if (!existsSync(CONFIG_FILE)) {
      return null;
    }
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function saveConfig(config: UserConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function deleteConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
  }
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
