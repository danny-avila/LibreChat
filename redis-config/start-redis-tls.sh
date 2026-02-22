#!/bin/bash

# Start Redis with TLS configuration
echo "Starting Redis with TLS on port 6379..."

# Check if Redis is already running
if pgrep -f "redis-server.*tls" > /dev/null; then
    echo "Redis with TLS is already running"
    exit 1
fi

# Start Redis with TLS config
redis-server /Users/theotr/WebstormProjects/LibreChat/redis-cluster/redis-tls.conf