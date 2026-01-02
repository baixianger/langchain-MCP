#!/bin/bash
# Hetzner VPS Setup Script for LangChain MCP API
# Run as root on Ubuntu 22.04+

set -e

echo "=== LangChain MCP API Setup ==="

# 1. System updates
echo ">>> Updating system..."
apt update && apt upgrade -y

# 2. Install Node.js 20
echo ">>> Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Install PM2
echo ">>> Installing PM2..."
npm install -g pm2

# 4. Install Nginx
echo ">>> Installing Nginx..."
apt install -y nginx

# 5. Install Certbot for HTTPS
echo ">>> Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# 6. Create directories
echo ">>> Creating directories..."
mkdir -p /opt/langchain-mcp/{api,data/chroma}
mkdir -p /var/log/langchain-mcp
chown -R $SUDO_USER:$SUDO_USER /opt/langchain-mcp
chown -R $SUDO_USER:$SUDO_USER /var/log/langchain-mcp

# 7. Firewall
echo ">>> Configuring firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Upload API code:      rsync -avz packages/api/ user@vps:/opt/langchain-mcp/api/"
echo "2. Upload ChromaDB data: rsync -avz data/chroma/ user@vps:/opt/langchain-mcp/data/chroma/"
echo "3. SSH to server and:"
echo "   cd /opt/langchain-mcp/api"
echo "   cp .env.example .env"
echo "   nano .env  # Edit with your keys"
echo "   npm install"
echo "   npm run build"
echo "   pm2 start ecosystem.config.cjs"
echo "   pm2 save && pm2 startup"
echo "4. Setup Nginx:"
echo "   cp nginx.conf /etc/nginx/sites-available/langchain-mcp"
echo "   ln -s /etc/nginx/sites-available/langchain-mcp /etc/nginx/sites-enabled/"
echo "   nginx -t && systemctl reload nginx"
echo "5. Get HTTPS:"
echo "   certbot --nginx -d langchain-mcp.duckdns.org"
