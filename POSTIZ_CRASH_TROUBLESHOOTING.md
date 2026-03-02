# Postiz Crash Troubleshooting Guide

## Problem
Postiz works fine initially but crashes/hangs after 20-30 minutes, showing gateway timeout errors.

## Immediate Actions When Crash Occurs

### 1. Run Diagnostics
```bash
cd postiz-deployment
chmod +x diagnose.sh
./diagnose.sh > crash-report-$(date +%Y%m%d-%H%M%S).txt
```

This will capture:
- Container status
- Resource usage (CPU/Memory)
- Recent logs
- Network connectivity
- Disk space
- System memory

### 2. Quick Restart
```bash
docker restart postiz
```

### 3. If Restart Doesn't Work
```bash
docker-compose restart
```

### 4. Nuclear Option (Full Restart)
```bash
docker-compose down
docker-compose up -d
```

## Root Cause Analysis

### Common Causes:

#### 1. Memory Exhaustion
**Symptoms:**
- Container shows high memory usage before crash
- OOM (Out of Memory) errors in logs

**Solution:**
- Added memory limits: 2GB max for Postiz, 1GB for Temporal
- Added `NODE_OPTIONS: "--max-old-space-size=1536"` to prevent Node.js memory leaks

**Check:**
```bash
docker stats --no-stream postiz
```

#### 2. Temporal Connection Loss
**Symptoms:**
- Logs show "connection refused" to temporal:7233
- Temporal container is down or unhealthy

**Solution:**
- Ensure Temporal is running: `docker ps | grep temporal`
- Check Temporal logs: `docker logs temporal --tail 100`
- Restart Temporal: `docker restart temporal`

**Check:**
```bash
docker exec postiz nc -zv temporal 7233
```

#### 3. Database Connection Pool Exhaustion
**Symptoms:**
- "Too many connections" errors
- "Connection pool timeout" errors

**Solution:**
Add to `.env`:
```env
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_POOL_IDLE_TIMEOUT=30000
```

#### 4. Redis Connection Issues
**Symptoms:**
- "ECONNREFUSED" to Redis
- Session/cache errors

**Solution:**
```bash
docker restart postiz-redis
docker restart postiz
```

#### 5. Disk Space Full
**Symptoms:**
- "No space left on device" errors
- Logs stop being written

**Solution:**
```bash
# Check disk space
df -h

# Clean up Docker
docker system prune -a --volumes -f

# Clean up logs
docker-compose down
rm -rf logs/*
docker-compose up -d
```

#### 6. Nginx/Proxy Timeout
**Symptoms:**
- 504 Gateway Timeout from Coolify/Nginx
- Container is running but not responding

**Solution:**
In Coolify, increase proxy timeout settings:
- Read timeout: 300s
- Connect timeout: 300s
- Send timeout: 300s

## Improvements Applied

### 1. Resource Limits
```yaml
deploy:
  resources:
    limits:
      memory: 2G
    reservations:
      memory: 512M
```

### 2. Log Rotation
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### 3. Keep-Alive Settings
```yaml
KEEP_ALIVE_TIMEOUT: "65000"
HEADERS_TIMEOUT: "66000"
```

### 4. Node.js Memory Management
```yaml
NODE_OPTIONS: "--max-old-space-size=1536"
```

## Automated Monitoring

### Setup Cron Job for Auto-Restart
```bash
# Edit crontab
crontab -e

# Add this line to check every 5 minutes
*/5 * * * * /path/to/postiz-deployment/monitor.sh >> /var/log/postiz-monitor.log 2>&1
```

### Manual Monitoring
```bash
# Run monitor script manually
cd postiz-deployment
chmod +x monitor.sh
./monitor.sh
```

## Long-term Solutions

### Option 1: Increase Server Resources
If crashes are due to memory/CPU:
- Upgrade to a server with more RAM (minimum 4GB recommended)
- Allocate more CPU cores

### Option 2: Use External Services
Replace resource-heavy services:
- Use managed PostgreSQL (e.g., AWS RDS, DigitalOcean Managed DB)
- Use managed Redis (e.g., Redis Cloud, AWS ElastiCache)
- This reduces load on your server

### Option 3: Separate Temporal
Run Temporal on a separate server:
- Temporal is resource-intensive
- Moving it to another server can help

### Option 4: Scheduled Restarts
As a workaround, schedule daily restarts:
```bash
# Add to crontab
0 3 * * * cd /path/to/postiz-deployment && docker-compose restart
```

## Debugging Commands

### Check if container is running
```bash
docker ps | grep postiz
```

### View real-time logs
```bash
docker logs postiz -f
```

### Check last 200 lines of logs
```bash
docker logs postiz --tail 200
```

### Check container resource usage
```bash
docker stats postiz
```

### Check all containers
```bash
docker-compose ps
```

### Inspect container
```bash
docker inspect postiz
```

### Check network connectivity
```bash
docker exec postiz ping -c 3 temporal
docker exec postiz ping -c 3 postiz-postgres
docker exec postiz ping -c 3 postiz-redis
```

### Check environment variables
```bash
docker exec postiz env | grep -E "TEMPORAL|DATABASE|REDIS"
```

## What to Send for Support

If issues persist, collect this information:

1. **Diagnostic Report:**
   ```bash
   ./diagnose.sh > crash-report.txt
   ```

2. **Full Logs:**
   ```bash
   docker logs postiz > postiz-full.log
   docker logs temporal > temporal-full.log
   ```

3. **Docker Compose Config:**
   ```bash
   cat docker-compose.yml
   ```

4. **Environment Variables (sanitized):**
   ```bash
   cat .env | grep -v "SECRET\|PASSWORD\|KEY"
   ```

5. **Server Specs:**
   - RAM: `free -h`
   - CPU: `lscpu`
   - Disk: `df -h`

## Prevention Checklist

- [ ] Resource limits configured
- [ ] Log rotation enabled
- [ ] Monitoring script setup
- [ ] Cron job for health checks
- [ ] Backup strategy in place
- [ ] Server has adequate resources (4GB+ RAM recommended)
- [ ] Disk space monitored
- [ ] Logs reviewed regularly

## Next Steps After Crash

1. Run diagnostics script
2. Save crash report
3. Restart affected services
4. Monitor for 1 hour
5. If crash repeats, analyze logs for patterns
6. Consider implementing automated monitoring
7. If persistent, consider upgrading server resources
