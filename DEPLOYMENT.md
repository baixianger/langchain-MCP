# Deployment Guide

## Architecture

All services run as Docker containers on a single VPS, managed by Docker Compose.

```
Internet → Nginx (80/443) → API (internal)
                          → Static homepage
           ChromaDB (internal only)
```

### Services

| Service | Image | Port |
|---------|-------|------|
| nginx | nginx:alpine | 80, 443 (public) |
| api | node:20-slim (custom build) | 3000 (internal) |
| chromadb | chromadb/chroma | 8000 (internal) |

### Data Persistence

All persistent data is stored on the host and mounted into containers:

```
/opt/langchain-mcp/data/
├── users.db          # SQLite - user accounts & API keys
├── langchain.db      # SQLite - usage tracking
└── chroma/           # ChromaDB vector data
```

Data survives container restarts and redeployments.

---

## Prerequisites

- Docker + Docker Compose v2
- SSH access to the VPS
- SSH host alias configured locally (see your `~/.ssh/config`)

### VPS Note (IPv6-only hosting)

If the VPS is IPv6-only (e.g. Hetzner), Docker containers need NAT66 to reach the internet during builds:

```bash
# Enable IPv6 forwarding
sysctl -w net.ipv6.conf.all.forwarding=1
echo 'net.ipv6.conf.all.forwarding=1' >> /etc/sysctl.conf

# Setup NAT66
nft add table ip6 nat
nft add chain ip6 nat postrouting '{ type nat hook postrouting priority 100 ; }'
nft add rule ip6 nat postrouting oif eth0 masquerade

# Enable IPv6 in Docker daemon
cat > /etc/docker/daemon.json << 'EOF'
{"ipv6": true, "fixed-cidr-v6": "fd00::/80"}
EOF
systemctl restart docker
```

---

## Deploy

```bash
./deploy.sh
```

This will:
1. Rsync source files to the VPS (excludes `.env`, `node_modules`, `.git`, data)
2. Build Docker images on the VPS
3. Restart containers with `docker compose up -d --build`

### First-time setup

On a fresh VPS, before running `deploy.sh`:

```bash
# Create deploy user
useradd -m -s /bin/bash <username>
usermod -aG docker <username>

# Copy SSH keys
mkdir -p /home/<username>/.ssh
cp /root/.ssh/authorized_keys /home/<username>/.ssh/
chown -R <username>:<username> /home/<username>/.ssh
chmod 700 /home/<username>/.ssh && chmod 600 /home/<username>/.ssh/authorized_keys

# Create data directory
mkdir -p /opt/langchain-mcp/data

# Create .env file (see .env.example)
cp .env.example /opt/langchain-mcp/.env
nano /opt/langchain-mcp/.env
```

---

## Environment Variables

See `.env.example` for all required variables. The `.env` file lives on the VPS at `/opt/langchain-mcp/.env` and is never committed to git.

Key variables:

```
PORT=3000
NODE_ENV=production
DB_PATH=/app/data/users.db
CHROMA_PATH=http://chromadb:8000   # Docker service name, not localhost
OPENROUTER_API_KEY=...
EMBEDDING_MODEL=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
KOFI_VERIFICATION_TOKEN=...
```

---

## Useful Commands

```bash
# Check container status
ssh <vps> "docker compose -f /opt/langchain-mcp/docker-compose.yml ps"

# View logs
ssh <vps> "docker compose -f /opt/langchain-mcp/docker-compose.yml logs -f api"

# Restart a single service
ssh <vps> "docker compose -f /opt/langchain-mcp/docker-compose.yml restart api"

# Clean unused Docker images after deploy
ssh <vps> "docker image prune -f"
```

---

## SSL Certificates

Cloudflare Origin CA certificates are stored on the VPS at `/etc/nginx/ssl/` and mounted into the nginx container. They can be regenerated anytime from the Cloudflare Dashboard:

**SSL/TLS → Origin Server → Create Certificate**
