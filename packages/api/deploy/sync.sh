#!/bin/bash
# Sync script for updating VPS
# Usage: ./sync.sh user@your-vps-ip

set -e

if [ -z "$1" ]; then
    echo "Usage: ./sync.sh user@vps-ip"
    exit 1
fi

VPS=$1
REMOTE_PATH="/opt/langchain-mcp"

echo "=== Syncing to $VPS ==="

# Build locally first
echo ">>> Building API..."
cd "$(dirname "$0")/.."
npm run build

# Sync API code (exclude node_modules, data)
echo ">>> Syncing API code..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude 'data' \
    --exclude '.env' \
    ./ "$VPS:$REMOTE_PATH/api/"

# Optionally sync ChromaDB data
read -p "Sync ChromaDB data? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ">>> Syncing ChromaDB data..."
    rsync -avz ../../data/chroma/ "$VPS:$REMOTE_PATH/data/chroma/"
fi

# Restart on server
echo ">>> Restarting service..."
ssh "$VPS" "cd $REMOTE_PATH/api && npm install --production && pm2 restart langchain-mcp-api"

echo "=== Sync complete ==="
