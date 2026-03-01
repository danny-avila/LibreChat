#!/bin/bash

echo "=== Postiz Diagnostics ==="
echo ""

echo "1. Container Status:"
docker ps -a --filter "name=postiz" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

echo "2. Container Resource Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" postiz temporal temporal-elasticsearch postiz-postgres postiz-redis
echo ""

echo "3. Last 50 lines of Postiz logs:"
docker logs postiz --tail 50
echo ""

echo "4. Last 30 lines of Temporal logs:"
docker logs temporal --tail 30
echo ""

echo "5. Check Temporal connectivity from Postiz:"
docker exec postiz sh -c "nc -zv temporal 7233 2>&1" || echo "Cannot connect to Temporal"
echo ""

echo "6. Check Redis connectivity:"
docker exec postiz sh -c "nc -zv postiz-redis 6379 2>&1" || echo "Cannot connect to Redis"
echo ""

echo "7. Check PostgreSQL connectivity:"
docker exec postiz sh -c "nc -zv postiz-postgres 5432 2>&1" || echo "Cannot connect to PostgreSQL"
echo ""

echo "8. Disk space:"
df -h | grep -E "Filesystem|/dev/"
echo ""

echo "9. Memory usage:"
free -h
echo ""

echo "=== End Diagnostics ==="
