# Postiz Stability Fixes

## Problem
Postiz becomes inaccessible after a while, showing gateway timeout errors until the container is restarted.

## Root Causes
1. **No health checks** - Docker doesn't know when containers are unhealthy
2. **Missing restart policies** - Some services don't auto-restart on failure
3. **Temporal connection issues** - Postiz loses connection to Temporal workflow engine
4. **Memory/resource exhaustion** - Containers may run out of resources over time

## Solutions Applied

### 1. Added Health Checks
All critical services now have health checks:

**Postiz App:**
```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

**Temporal:**
```yaml
healthcheck:
  test: ["CMD", "tctl", "--address", "temporal:7233", "cluster", "health"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 90s
```

**Elasticsearch:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 60s
```

**PostgreSQL (Temporal):**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U temporal"]
  interval: 10s
  timeout: 5s
  retries: 5
```

### 2. Added Restart Policies
All services now have `restart: always` to auto-recover from crashes.

### 3. Improved Dependency Management
Services now wait for dependencies to be healthy before starting:

```yaml
depends_on:
  temporal-postgresql:
    condition: service_healthy
  temporal-elasticsearch:
    condition: service_healthy
```

## Monitoring Commands

### Check Container Health Status
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### View Postiz Logs
```bash
docker logs postiz --tail 100 -f
```

### View Temporal Logs
```bash
docker logs temporal --tail 100 -f
```

### Check All Container Stats (CPU/Memory)
```bash
docker stats
```

### Restart Specific Service
```bash
docker-compose restart postiz
```

### Full Stack Restart
```bash
docker-compose down
docker-compose up -d
```

## Additional Recommendations

### 1. Resource Limits (Optional)
If you're on a resource-constrained server, add limits to prevent memory exhaustion:

```yaml
services:
  postiz:
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

### 2. Log Rotation
Prevent logs from filling up disk space:

```yaml
services:
  postiz:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 3. Monitor Temporal Connection
Add this to your monitoring:
```bash
# Check if Temporal is reachable from Postiz
docker exec postiz wget -q --spider http://temporal:7233
echo $?  # Should return 0 if healthy
```

### 4. Database Connection Pooling
Ensure your `.env` has reasonable connection limits:
```env
# Add these if not present
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
```

## Troubleshooting Steps

### If Gateway Timeout Occurs:

1. **Check container status:**
   ```bash
   docker ps -a | grep postiz
   ```

2. **Check logs for errors:**
   ```bash
   docker logs postiz --tail 200
   docker logs temporal --tail 200
   ```

3. **Check Temporal connectivity:**
   ```bash
   docker exec postiz nc -zv temporal 7233
   ```

4. **Check resource usage:**
   ```bash
   docker stats --no-stream
   ```

5. **Restart unhealthy services:**
   ```bash
   docker-compose restart postiz temporal
   ```

### Common Error Patterns:

**"Connection refused to temporal:7233"**
- Temporal service crashed or not healthy
- Solution: `docker-compose restart temporal`

**"Out of memory"**
- Container exhausted available memory
- Solution: Add memory limits or increase server resources

**"Database connection pool exhausted"**
- Too many open connections
- Solution: Restart postiz or adjust pool settings

**"Elasticsearch cluster unhealthy"**
- ES needs more memory or disk space
- Solution: Check disk space, restart ES

## Deployment Checklist

After applying these fixes:

1. ✅ Stop current deployment
2. ✅ Pull latest docker-compose.yml changes
3. ✅ Restart with: `docker-compose up -d`
4. ✅ Wait 2-3 minutes for all services to become healthy
5. ✅ Check health: `docker ps`
6. ✅ Test UI: Visit `https://postiz.cloud.jamot.pro`
7. ✅ Monitor logs for 10-15 minutes
8. ✅ Test posting functionality

## Next Steps

1. Deploy the updated docker-compose.yml to production
2. Monitor for 24-48 hours to confirm stability
3. If issues persist, check server resources (RAM, CPU, disk)
4. Consider setting up external monitoring (e.g., UptimeRobot, Pingdom)
