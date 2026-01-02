#!/usr/bin/env node

import { Command } from 'commander';
import http from 'http';
import open from 'open';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, saveConfig, deleteConfig, getConfigPath, DEFAULT_API_URL } from '../src/config.js';
import { APIClient } from '../src/api-client.js';
import { createServer } from '../src/server.js';

const program = new Command();

program
  .name('langchain-mcp')
  .description('CLI for LangChain MCP server')
  .version('1.0.0');

/**
 * Default action - start MCP server (when no command given)
 */
program
  .command('serve', { isDefault: true, hidden: true })
  .description('Start MCP server')
  .action(async () => {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  });

/**
 * Login command - supports Google and GitHub OAuth
 */
program
  .command('login')
  .description('Login to LangChain MCP service')
  .option('--provider <provider>', 'OAuth provider: google or github', 'google')
  .option('--no-browser', 'Print URL instead of opening browser')
  .option('--api-url <url>', 'API server URL', DEFAULT_API_URL)
  .action(async (options) => {
    const existingConfig = loadConfig();
    if (existingConfig) {
      console.log('Already logged in.');
      console.log('Run "langchain-mcp logout" first to log out.');
      return;
    }

    const provider = options.provider.toLowerCase();
    if (provider !== 'google' && provider !== 'github') {
      console.error('Invalid provider. Use --provider google or --provider github');
      process.exit(1);
    }

    await loginWithWebFlow(options.apiUrl, provider, options.browser);
  });

/**
 * Web Flow login - opens browser for OAuth
 */
async function loginWithWebFlow(apiUrl: string, provider: 'google' | 'github', openBrowser: boolean) {
  const port = 9876;
  const callbackUrl = `http://localhost:${port}/callback`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);

    if (url.pathname === '/callback') {
      const apiKey = url.searchParams.get('api_key');
      const userJson = url.searchParams.get('user');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Login Failed</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h1>❌ Login Failed</h1>
            <p>${error}</p>
          </body>
          </html>
        `);
        console.error(`\nLogin failed: ${error}`);
        server.close();
        process.exit(1);
      }

      if (apiKey && userJson) {
        try {
          const user = JSON.parse(userJson);

          // Save config
          saveConfig({
            api_key: apiKey,
            api_url: apiUrl,
            user,
          });

          console.log(`\n✅ Logged in as ${user.email}`);
          console.log(`💰 Credits: $${user.credits.toFixed(2)} remaining`);
          console.log(`📁 Config saved to ${getConfigPath()}`);

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Login Successful</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>✅ Login Successful!</h1>
              <p>Welcome, ${user.name || user.email}!</p>
              <p>You can close this window and return to your terminal.</p>
            </body>
            </html>
          `);

          setTimeout(() => {
            server.close();
            process.exit(0);
          }, 1000);
        } catch (err) {
          res.writeHead(400);
          res.end('Login failed: invalid response');
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Login Failed</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h1>❌ Login Failed</h1>
            <p>Missing API key</p>
          </body>
          </html>
        `);
        server.close();
        process.exit(1);
      }
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    // OAuth URL via our API
    const authUrl = `${apiUrl}/auth/${provider}?callback=${encodeURIComponent(callbackUrl)}`;

    const providerName = provider === 'google' ? 'Google' : 'GitHub';
    console.log(`🔐 Logging in with ${providerName}...`);

    if (openBrowser) {
      console.log('Opening browser for login...');
      open(authUrl);
    } else {
      console.log('Open this URL in your browser:');
      console.log(authUrl);
    }

    console.log(`\nWaiting for login callback on port ${port}...`);
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    console.log('\n⏰ Login timeout. Please try again.');
    server.close();
    process.exit(1);
  }, 5 * 60 * 1000);
}

/**
 * Status command - show current login status and usage
 */
program
  .command('status')
  .description('Show current login status and usage')
  .action(async () => {
    const config = loadConfig();

    if (!config) {
      console.log('❌ Not logged in.');
      console.log('Run "langchain-mcp login" to log in.');
      return;
    }

    console.log(`👤 Logged in as: ${config.user?.email || 'Unknown'}`);
    console.log(`📁 Config: ${getConfigPath()}`);

    try {
      const client = new APIClient(config.api_url, config.api_key);
      const usage = await client.getUsage();

      console.log(`\n💰 Credits: $${usage.credits.remaining.toFixed(2)} remaining`);
      console.log(`\n📊 Usage:`);
      console.log(`  Today: ${usage.usage.today.tokens.toLocaleString()} tokens (${usage.usage.today.requests} requests)`);
      console.log(`  This month: ${usage.usage.this_month.tokens.toLocaleString()} tokens (${usage.usage.this_month.requests} requests)`);
      console.log(`  All time: ${usage.usage.all_time.tokens.toLocaleString()} tokens (${usage.usage.all_time.requests} requests)`);
    } catch (error) {
      console.log(`\n⚠️  Could not fetch usage: ${(error as Error).message}`);
      console.log('Your API key may be invalid. Run "langchain-mcp login" to log in again.');
    }
  });

/**
 * Logout command - remove local credentials
 */
program
  .command('logout')
  .description('Logout and remove local credentials')
  .action(async () => {
    const config = loadConfig();

    if (!config) {
      console.log('Not logged in.');
      return;
    }

    deleteConfig();
    console.log('✅ Logged out successfully.');
  });

program.parse();
