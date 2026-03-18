#!/bin/bash
# Deploy to VPS via Docker Compose

set -e

VPS="personal-ts"
DEPLOY_DIR="/opt/langchain-mcp"

echo "🚀 Deploying to VPS..."

# Sync source to VPS (build happens on VPS inside Docker)
echo "📤 Syncing source to VPS..."
rsync -avz --delete \
  --exclude '.git' \
  --exclude '.env' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude 'node_modules' \
  --exclude 'packages/api/dist' \
  --exclude 'packages/ingest/.venv' \
  --exclude 'packages/mcp-server/dist' \
  --exclude 'data' \
  ./ $VPS:$DEPLOY_DIR/

# Build images and restart containers
echo "🐳 Building and restarting containers..."
ssh $VPS "cd $DEPLOY_DIR && docker compose up -d --build"

echo "✅ Deploy complete!"
