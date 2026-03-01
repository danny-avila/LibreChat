#!/bin/bash

# Postiz Health Monitor & Auto-Restart Script
# This script checks if Postiz is responding and restarts it if not

POSTIZ_URL="https://postiz.cloud.jamot.pro"
MAX_RETRIES=3
RETRY_DELAY=10

echo "[$(date)] Starting Postiz health check..."

# Function to check if Postiz is responding
check_postiz() {
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$POSTIZ_URL" 2>/dev/null)
    echo "$response"
}

# Function to restart Postiz
restart_postiz() {
    echo "[$(date)] Restarting Postiz container..."
    docker restart postiz
    sleep 30  # Wait for container to start
}

# Main health check loop
for i in $(seq 1 $MAX_RETRIES); do
    http_code=$(check_postiz)
    
    if [ "$http_code" = "200" ] || [ "$http_code" = "302" ] || [ "$http_code" = "301" ]; then
        echo "[$(date)] Postiz is healthy (HTTP $http_code)"
        exit 0
    else
        echo "[$(date)] Attempt $i/$MAX_RETRIES: Postiz returned HTTP $http_code"
        
        if [ $i -lt $MAX_RETRIES ]; then
            echo "[$(date)] Waiting ${RETRY_DELAY}s before retry..."
            sleep $RETRY_DELAY
        fi
    fi
done

# If we get here, all retries failed
echo "[$(date)] All health checks failed. Restarting Postiz..."
restart_postiz

# Verify restart worked
sleep 10
http_code=$(check_postiz)
if [ "$http_code" = "200" ] || [ "$http_code" = "302" ] || [ "$http_code" = "301" ]; then
    echo "[$(date)] Postiz successfully restarted and is now healthy"
    exit 0
else
    echo "[$(date)] ERROR: Postiz still unhealthy after restart (HTTP $http_code)"
    echo "[$(date)] Manual intervention required. Check logs with: docker logs postiz"
    exit 1
fi
