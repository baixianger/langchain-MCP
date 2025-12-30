#!/usr/bin/env tsx

import { config } from 'dotenv';
config();

import { runIngestion } from '../src/ingestion/orchestrator.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const options: { dryRun: boolean; repositories?: string[]; help: boolean } = {
    dryRun: false,
    help: false,
  };

  const repos: string[] = [];

  for (const arg of args) {
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '-d' || arg === '--dry-run') options.dryRun = true;
    else if (!arg.startsWith('-')) repos.push(arg);
  }

  if (repos.length > 0) options.repositories = repos;
  return options;
}

function showHelp() {
  console.log(`
LangChain RAG Ingestion

Usage: npm run ingest [options] [repos...]

Options:
  -h, --help     Show help
  -d, --dry-run  Don't store, just show what would be processed

Repos: docs, langchain, langchainjs, langgraph, langgraphjs, deepagents, deepagentsjs

Examples:
  npm run ingest              # Ingest all repos
  npm run ingest docs         # Only docs repo
  npm run ingest -d langgraph # Dry run for langgraph
`);
}

async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  console.log('LangChain RAG Ingestion');
  console.log('=======================');
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Repos: ${options.repositories?.join(', ') || 'All'}\n`);

  const result = await runIngestion(options);

  if (result.failed > 0) {
    console.error(`\n${result.failed} files failed`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});
