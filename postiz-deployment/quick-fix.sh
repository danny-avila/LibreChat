#!/bin/bash

echo "=== Postiz Quick Fix Script ==="
echo ""

# Check if running as root or with docker permissions
if ! docker ps > /dev/null 2>&1; then
    echo "ERROR: Cannot access Docker. Run with sudo or ensure user is in docker group."
    exit 1
fi

echo "1. Checking container status..."
docker ps -a --filter "name=postiz" --format "table {{.Names}}\t{{.Status}}"
echo ""

echo "2. Restarting Postiz container..."
docker restart postiz
echo "Waiting 30 seconds for container to start..."
sleep 30

echo ""
echo "3. Checking if Postiz is responding..."
for i in {1..5}; do
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://postiz.cloud.jamot.pro 2>/dev/null)
    if [ "$response" = "200" ] || [ "$response" = "302" ] || [ "$response" = "301" ]; then
        echo "✓ Postiz is responding (HTTP $response)"
        echo ""
        echo "=== Fix Complete ==="
        echo "Postiz should now be accessible at https://postiz.cloud.jamot.pro"
        exit 0
    else
        echo "Attempt $i/5: HTTP $response - waiting 10s..."
        sleep 10
    fi
done

echo ""
echo "⚠ Postiz still not responding. Trying full restart..."
echo ""

echo "4. Restarting all services..."
cd "$(dirname "$0")"
docker-compose restart

echo "Waiting 60 seconds for all services to start..."
sleep 60

echo ""
echo "5. Final check..."
response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 https://postiz.cloud.jamot.pro 2>/dev/null)
if [ "$response" = "200" ] || [ "$response" = "302" ] || [ "$response" = "301" ]; then
    echo "✓ Postiz is now responding (HTTP $response)"
    echo ""
    echo "=== Fix Complete ==="
else
    echo "✗ Postiz still not responding (HTTP $response)"
    echo ""
    echo "=== Manual Intervention Required ==="
    echo ""
    echo "Please check logs:"
    echo "  docker logs postiz --tail 100"
    echo "  docker logs temporal --tail 100"
    echo ""
    echo "Or run diagnostics:"
    echo "  ./diagnose.sh"
    exit 1
fi
