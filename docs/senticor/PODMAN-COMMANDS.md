# Podman Commands for LibreChat Local Development

**Quick reference for common Podman operations with LibreChat**

---

## 🚀 Starting & Stopping

### Start All Services
```bash
podman-compose up -d
```

### Start with Logs Visible
```bash
podman-compose up
```

### Stop All Services
```bash
podman-compose down
```

### Restart All Services
```bash
podman-compose restart
```

### Restart Specific Service
```bash
podman restart LibreChat
podman restart mongodb
podman restart meilisearch
```

---

## 📊 Status & Monitoring

### Check Running Containers
```bash
podman ps
```

### Check All Containers (including stopped)
```bash
podman ps -a
```

### View Container Logs
```bash
# Real-time logs (follow)
podman logs -f LibreChat

# Last 100 lines
podman logs --tail 100 LibreChat

# Since specific time
podman logs --since 5m LibreChat
```

### View Logs for All Services
```bash
podman-compose logs -f
```

### Check Container Resource Usage
```bash
podman stats LibreChat
```

---

## 🔍 Debugging & Inspection

### Inspect Container Configuration
```bash
podman inspect LibreChat
```

### Check Environment Variables
```bash
podman exec LibreChat printenv

# Specific variable
podman exec LibreChat printenv HONEYCOMB_API_URL
podman exec LibreChat printenv MONGO_URI
```

### Execute Command in Container
```bash
# Interactive shell
podman exec -it LibreChat /bin/bash

# Single command
podman exec LibreChat ls -la /app
podman exec LibreChat node --version
```

### Check MCP Server Status
```bash
# Check if MCP servers initialized
podman logs LibreChat 2>&1 | grep "MCP servers initialized"

# Check specific MCP server
podman logs LibreChat 2>&1 | grep -i honeycomb
podman logs LibreChat 2>&1 | grep -i rechtsinformationen

# List MCP server files
podman exec LibreChat ls -la /app/mcp-servers/
podman exec LibreChat ls -la /app/mcp-servers/honeycomb/dist/index.js
podman exec LibreChat ls -la /app/mcp-servers/rechtsinformationen-bund-de/dist/index.js
```

### Check Network Connectivity
```bash
# Test connection to Honeycomb API
podman exec LibreChat curl http://host.docker.internal:8000/health
podman exec LibreChat curl http://host.containers.internal:8000/health

# Test MongoDB connection
podman exec LibreChat curl http://mongodb:27017

# Test MeiliSearch
podman exec LibreChat curl http://meilisearch:7700/health
```

---

## 🔧 Troubleshooting

### Rebuild and Restart
```bash
# Full rebuild
podman-compose down
podman-compose build
podman-compose up -d

# No cache rebuild
podman-compose build --no-cache
```

### Clean Up Containers
```bash
# Remove stopped containers
podman container prune

# Remove all LibreChat containers
podman-compose down -v

# Remove specific container
podman rm -f LibreChat
```

### Clean Up Images
```bash
# Remove unused images
podman image prune

# Remove specific image
podman rmi librechat-api
```

### Clean Up Volumes
```bash
# List volumes
podman volume ls

# Remove specific volume
podman volume rm librechat_data

# Remove all unused volumes (BE CAREFUL!)
podman volume prune
```

### Check Port Bindings
```bash
# Check what ports are exposed
podman port LibreChat

# Check if port is in use
lsof -i :3080
lsof -i :27017
lsof -i :7700
```

### Reset Everything (Nuclear Option)
```bash
# Stop all containers
podman-compose down -v

# Remove all containers
podman rm -f $(podman ps -aq)

# Remove all images
podman rmi -f $(podman images -q)

# Remove all volumes
podman volume prune -f

# Start fresh
podman-compose up -d
```

---

## 📝 Working with MCP Servers

### Update MCP Server (Honeycomb)
```bash
# Build new version
cd /Users/wolfgang/workspace/senticor-hive-mcp
npm install
npm run build

# Restart LibreChat to load new version
podman restart LibreChat

# Verify it loaded
podman logs LibreChat 2>&1 | grep -A 10 "honeycomb"
```

### Update MCP Server (Rechtsinformationen)
```bash
# Build new version
cd /Users/wolfgang/workspace/rechtsinformationen-bund-de-mcp
git pull
npm install
npm run build

# Restart LibreChat
podman restart LibreChat

# Verify it loaded
podman logs LibreChat 2>&1 | grep -A 10 "rechtsinformationen"
```

### Debug MCP Server Loading
```bash
# Check if files are mounted
podman exec LibreChat ls -la /app/mcp-servers/

# Check if dist files exist
podman exec LibreChat ls -la /app/mcp-servers/honeycomb/dist/
podman exec LibreChat ls -la /app/mcp-servers/rechtsinformationen-bund-de/dist/

# Test MCP server directly (outside container)
cd /Users/wolfgang/workspace/senticor-hive-mcp
node dist/index.js

# Check MCP initialization logs
podman logs LibreChat 2>&1 | grep -A 50 "Initializing MCP"
```

---

## 🗄️ Database Operations

### MongoDB

```bash
# Access MongoDB shell
podman exec -it mongodb mongosh

# Backup database
podman exec mongodb mongodump --out /tmp/backup
podman cp mongodb:/tmp/backup ./mongodb-backup

# Restore database
podman cp ./mongodb-backup mongodb:/tmp/backup
podman exec mongodb mongorestore /tmp/backup

# List databases
podman exec mongodb mongosh --eval "show dbs"

# Check LibreChat database
podman exec mongodb mongosh LibreChat --eval "db.stats()"
```

### MeiliSearch

```bash
# Check health
podman exec meilisearch curl http://localhost:7700/health

# Get stats
podman exec meilisearch curl http://localhost:7700/stats

# Check indexes
podman exec meilisearch curl http://localhost:7700/indexes

# Reset MeiliSearch sync (if needed)
npm run reset-meili-sync
```

---

## 🔐 Configuration & Files

### Copy Files to/from Container
```bash
# Copy file to container
podman cp ./librechat.yaml LibreChat:/app/librechat.yaml

# Copy file from container
podman cp LibreChat:/app/librechat.yaml ./librechat-backup.yaml

# Copy logs
podman cp LibreChat:/var/log/app.log ./logs/
```

### Edit Files in Container
```bash
# Install editor if needed
podman exec LibreChat apt-get update && apt-get install -y vim

# Edit file
podman exec -it LibreChat vim /app/librechat.yaml
```

### Reload Configuration
```bash
# After editing librechat.yaml on host
podman restart LibreChat

# Watch logs to verify reload
podman logs -f LibreChat
```

---

## 🧪 Testing

### Run E2E Tests
```bash
# Make sure containers are running
podman ps | grep LibreChat

# Run tests
npm run e2e

# Run specific test
npm run e2e -- hive-entity-extraction.spec.ts

# Run with UI
npm run e2e:headed
```

### Test API Endpoints
```bash
# Health check
curl http://localhost:3080/api/health

# Check MCP tools
curl http://localhost:3080/api/tools

# Check models
curl http://localhost:3080/api/models
```

---

## 📦 Volume Management

### Backup Volumes
```bash
# Backup MongoDB data
podman run --rm \
  --volumes-from mongodb \
  -v $(pwd):/backup \
  alpine tar czf /backup/mongodb-backup.tar.gz /data/db

# Backup LibreChat data
podman run --rm \
  --volumes-from LibreChat \
  -v $(pwd):/backup \
  alpine tar czf /backup/librechat-backup.tar.gz /app
```

### Restore Volumes
```bash
# Restore MongoDB data
podman run --rm \
  --volumes-from mongodb \
  -v $(pwd):/backup \
  alpine tar xzf /backup/mongodb-backup.tar.gz -C /
```

---

## 🔄 Common Workflows

### Update Everything
```bash
# 1. Update LibreChat
cd /Users/wolfgang/workspace/LibreChat
git pull
npm install

# 2. Update MCP servers
cd /Users/wolfgang/workspace/senticor-hive-mcp
git pull && npm install && npm run build

cd /Users/wolfgang/workspace/rechtsinformationen-bund-de-mcp
git pull && npm install && npm run build

# 3. Restart services
cd /Users/wolfgang/workspace/LibreChat
podman-compose down
podman-compose up -d

# 4. Verify
podman logs -f LibreChat
```

### Quick Restart After Code Change
```bash
# If only MCP server changed
podman restart LibreChat

# If LibreChat code changed
podman-compose restart api

# If config changed
podman restart LibreChat
```

### Debug Agent Issues
```bash
# 1. Check if agent is running
podman ps | grep LibreChat

# 2. Check logs for errors
podman logs --tail 200 LibreChat | grep -i error

# 3. Check MCP tools loaded
podman logs LibreChat | grep "MCP servers initialized"

# 4. Check circuit breaker messages
podman logs LibreChat | grep "Circuit Breaker"

# 5. Check recursion limit
podman logs LibreChat | grep -i recursion
```

---

## 📊 Performance Monitoring

### Resource Usage
```bash
# Real-time stats
podman stats

# Specific container
podman stats LibreChat mongodb meilisearch

# Export stats to file
podman stats --no-stream > container-stats.txt
```

### Disk Usage
```bash
# Check container sizes
podman system df

# Detailed breakdown
podman system df -v

# Check specific volume
podman volume inspect librechat_data
```

---

## 🆘 Quick Fixes

### "MCP servers not loading"
```bash
# Check if MCP files are mounted correctly
podman exec LibreChat ls -la /app/mcp-servers/honeycomb/dist/index.js
podman exec LibreChat ls -la /app/mcp-servers/rechtsinformationen-bund-de/dist/index.js

# If you get "No such file or directory", check docker-compose.override.yml
# Common issue: wrong path in volume mount
# Should be: /Users/wolfgang/workspace/hive-mcp (not senticor-hive-mcp)

# Fix and restart
podman-compose down
podman-compose up -d
podman logs LibreChat | grep "MCP servers initialized"
```

### "Port already in use"
```bash
# Find what's using port 3080
lsof -i :3080

# Kill the process
kill -9 <PID>

# Restart
podman-compose up -d
```

### "Cannot connect to MongoDB"
```bash
# Check MongoDB is running
podman ps | grep mongodb

# Check MongoDB logs
podman logs mongodb

# Restart MongoDB
podman restart mongodb
```

### "Honeycomb API not accessible"
```bash
# Check if Hive is running on host
curl http://localhost:8000/health

# Check from container
podman exec LibreChat curl http://host.containers.internal:8000/health

# Check environment variable
podman exec LibreChat printenv HONEYCOMB_API_URL
```

---

## 🔗 Related Documentation

- [README-Senticor.md](../../README-Senticor.md) - Main setup guide
- [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment
- [HONEYCOMB-MCP-SETUP.md](HONEYCOMB-MCP-SETUP.md) - Honeycomb MCP configuration
- [CIRCUIT-BREAKER-IMPLEMENTATION.md](CIRCUIT-BREAKER-IMPLEMENTATION.md) - Circuit breaker setup

---

## 💡 Tips & Tricks

### Aliases (add to ~/.bashrc or ~/.zshrc)
```bash
# Podman compose shortcuts
alias pcu='podman-compose up -d'
alias pcd='podman-compose down'
alias pcr='podman-compose restart'
alias pcl='podman-compose logs -f'

# LibreChat specific
alias lc-logs='podman logs -f LibreChat'
alias lc-restart='podman restart LibreChat'
alias lc-shell='podman exec -it LibreChat /bin/bash'
alias lc-mcp='podman logs LibreChat | grep MCP'

# Quick troubleshooting
alias lc-errors='podman logs LibreChat | grep -i error'
alias lc-circuit='podman logs LibreChat | grep "Circuit Breaker"'
alias lc-status='podman ps | grep LibreChat && podman logs LibreChat | grep "MCP servers initialized"'
```

### Watch Mode for Logs
```bash
# Watch for errors
watch -n 2 'podman logs --tail 20 LibreChat | grep -i error'

# Watch for MCP activity
watch -n 2 'podman logs --tail 50 LibreChat | grep -i mcp'

# Watch container stats
watch -n 1 'podman stats --no-stream'
```

---

**Last Updated:** 2025-10-10
**LibreChat Version:** v0.8.0
**Author:** Claude Code with user wolfgang
