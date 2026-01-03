#!/bin/bash
# Deploy to VPS via rsync

set -e

echo "🚀 Deploying to VPS..."

# Build locally first
echo "📦 Building API..."
cd "$(dirname "$0")/packages/api"
npm run build

# Copy non-ts files that TypeScript doesn't compile
cp src/db/schema.sql dist/db/

# Sync to VPS
echo "📤 Syncing to VPS..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '*.log' \
  ./ langchain-mcp:/opt/langchain-mcp/api/

# Sync node_modules (needed since VPS can't npm install)
echo "📤 Syncing node_modules..."
rsync -avz --delete \
  --exclude 'better-sqlite3/build' \
  node_modules/ langchain-mcp:/opt/langchain-mcp/api/node_modules/

# Sync public files to nginx root
echo "📤 Syncing public files to nginx..."
ssh langchain-mcp "cp /opt/langchain-mcp/api/public/* /var/www/html/ && chmod 644 /var/www/html/*.{html,txt,xml} 2>/dev/null || chmod 644 /var/www/html/*"

# Rebuild native modules and restart service
echo "🔄 Rebuilding native modules and restarting..."
ssh langchain-mcp "cd /opt/langchain-mcp/api && npm rebuild better-sqlite3 && pm2 restart langchain-mcp-api"

echo "✅ Deploy complete!"
