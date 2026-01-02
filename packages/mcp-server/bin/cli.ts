#!/usr/bin/env node

import { Command } from 'commander';
import http from 'http';
import open from 'open';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, saveConfig, deleteConfig, getConfigPath, DEFAULT_API_URL, WEBSITE_URL } from '../src/config.js';
import { APIClient } from '../src/api-client.js';
import { createServer } from '../src/server.js';

// Get version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));

// ASCII Art Banner - Generated with oh-my-logo (shade style)
function printBanner() {
  const green = '\x1b[32m';
  const reset = '\x1b[0m';

  console.log(`
${green}░█░░░░░██░░█░░█░░███░████░█░░█░░██░░███░█░░█░░░░░░█░░█░████░███░
░█░░░░█  █░██░█░█   ░█   ░█░░█░█  █░ █ ░██░█░░░░░░████░█   ░█  █
░█░░░░████░█ ██░█░██░█░░░░████░████░░█░░█ ██░████░█  █░█░░░░███░
░█░░░░█  █░█░ █░█░ █░█░░░░█  █░█  █░░█░░█░ █░    ░█░░█░█░░░░█░░░
░████░█░░█░█░░█░███░░████░█░░█░█░░█░███░█░░█░░░░░░█░░█░████░█░░░${reset}
`);
}

function printDivider(char = '─', length = 70) {
  console.log('\x1b[90m' + char.repeat(length) + '\x1b[0m');
}

function printSection(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`); // Bold yellow
}

const program = new Command();

program
  .name('langchain-mcp')
  .description('CLI for LangChain MCP server')
  .version(pkg.version);

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
 * Login command - Google OAuth
 */
program
  .command('login')
  .description('Login to LangChain MCP service')
  .option('--no-browser', 'Print URL instead of opening browser')
  .option('--api-url <url>', 'API server URL', DEFAULT_API_URL)
  .action(async (options) => {
    const existingConfig = loadConfig();
    if (existingConfig) {
      console.log('Already logged in.');
      console.log('Run "langchain-mcp logout" first to log out.');
      return;
    }

    await loginWithWebFlow(options.apiUrl, options.browser);
  });

/**
 * Web Flow login - opens browser for Google OAuth
 */
async function loginWithWebFlow(apiUrl: string, openBrowser: boolean) {
  const port = 9876;
  const callbackUrl = `http://localhost:${port}/callback`;

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:${port}`);

    if (url.pathname === '/callback') {
      const apiKey = url.searchParams.get('api_key');
      const userJson = url.searchParams.get('user');
      const error = url.searchParams.get('error');

      if (error) {
        const failureUrl = new URL(`${WEBSITE_URL}/failure.html`);
        failureUrl.searchParams.set('error', error);
        res.writeHead(302, { 'Location': failureUrl.toString() });
        res.end();
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

          printBanner();
          printDivider();
          console.log('\n  \x1b[32m✓ Login Successful!\x1b[0m\n');

          printSection('👤 User');
          console.log(`   Name:   ${user.name || 'N/A'}`);
          console.log(`   Email:  ${user.email}`);

          printSection('💰 Credits');
          const creditColor = user.credits > 5 ? '\x1b[32m' : user.credits > 1 ? '\x1b[33m' : '\x1b[31m';
          console.log(`   Remaining: ${creditColor}$${user.credits.toFixed(2)}\x1b[0m`);

          printSection('☕ Support');
          console.log(`   Ko-fi: \x1b[36mhttps://ko-fi.com/baixianger\x1b[0m`);

          printSection('⚙️  Config');
          console.log(`   Saved to: ${getConfigPath()}`);

          console.log('');
          printDivider();
          console.log('');

          // Redirect to homepage success page
          const successUrl = new URL(`${WEBSITE_URL}/success.html`);
          successUrl.searchParams.set('name', user.name || user.email);
          res.writeHead(302, { 'Location': successUrl.toString() });
          res.end();

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
    const authUrl = `${apiUrl}/auth/google?callback=${encodeURIComponent(callbackUrl)}`;

    console.log('🔐 Logging in with Google...');

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

    printBanner();
    printDivider();

    if (!config) {
      console.log('\n  \x1b[31m✗ Not logged in\x1b[0m');
      console.log('  Run \x1b[36mlangchain-mcp login\x1b[0m to get started.\n');
      return;
    }

    // User Info Section
    printSection('👤 User');
    console.log(`   Name:   ${config.user?.name || 'N/A'}`);
    console.log(`   Email:  ${config.user?.email || 'Unknown'}`);
    console.log(`   ID:     ${config.user?.id || 'N/A'}`);

    try {
      const client = new APIClient(config.api_url, config.api_key);
      const usage = await client.getUsage();

      // Credits Section
      printSection('💰 Credits');
      const remaining = usage.credits.remaining;
      const creditColor = remaining > 5 ? '\x1b[32m' : remaining > 1 ? '\x1b[33m' : '\x1b[31m';
      console.log(`   Remaining: ${creditColor}$${remaining.toFixed(2)}\x1b[0m`);

      // Show Ko-fi prompt when low on credits
      if (remaining <= 1) {
        console.log(`\n   \x1b[33m⚠️  Low credits! Support the project:\x1b[0m`);
        console.log(`   \x1b[36m☕ https://ko-fi.com/baixianger\x1b[0m`);
      }

      // Token Usage Section
      printSection('📊 Token Usage');
      console.log(`   Today:      ${usage.usage.today.tokens.toLocaleString().padStart(12)} tokens  (${usage.usage.today.requests} requests)`);
      console.log(`   This Month: ${usage.usage.this_month.tokens.toLocaleString().padStart(12)} tokens  (${usage.usage.this_month.requests} requests)`);
      console.log(`   All Time:   ${usage.usage.all_time.tokens.toLocaleString().padStart(12)} tokens  (${usage.usage.all_time.requests} requests)`);

      // Support Section
      printSection('☕ Support');
      console.log(`   Ko-fi: \x1b[36mhttps://ko-fi.com/baixianger\x1b[0m`);

      // Config Section
      printSection('⚙️  Config');
      console.log(`   Path: ${getConfigPath()}`);
      console.log(`   API:  ${config.api_url}`);

    } catch (error) {
      console.log(`\n  \x1b[33m⚠️  Could not fetch usage: ${(error as Error).message}\x1b[0m`);
      console.log('  Your API key may be invalid. Run \x1b[36mlangchain-mcp login\x1b[0m again.');
    }

    console.log('');
    printDivider();
    console.log('');
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
