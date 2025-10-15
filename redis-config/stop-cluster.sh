#!/bin/bash

# Redis Cluster Shutdown Script
# This script stops all Redis cluster nodes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🛑 Stopping Redis Cluster..."

# Function to stop a Redis node
stop_node() {
    local port=$1
    
    if redis-cli -p $port ping &> /dev/null; then
        # Try graceful shutdown first
        redis-cli -p $port SHUTDOWN NOSAVE 2>/dev/null || true
        sleep 2
        
        # Check if still running and force kill if needed
        if redis-cli -p $port ping &> /dev/null; then
            PID=$(ps aux | grep "[r]edis-server.*:$port" | awk '{print $2}')
            if [ -n "$PID" ]; then
                kill -TERM $PID 2>/dev/null || true
                sleep 2
                if kill -0 $PID 2>/dev/null; then
                    kill -KILL $PID 2>/dev/null || true
                fi
            fi
        fi
        
        # Final check
        if redis-cli -p $port ping &> /dev/null; then
            echo "❌ Failed to stop Redis node on port $port"
            return 1
        else
            return 0
        fi
    else
        return 0
    fi
}

# Stop all nodes
NODES_STOPPED=0
for port in 7001 7002 7003; do
    if stop_node $port; then
        NODES_STOPPED=$((NODES_STOPPED + 1))
    fi
done

# Clean up cluster configuration files
rm -f nodes-7001.conf nodes-7002.conf nodes-7003.conf

if [ $NODES_STOPPED -eq 3 ]; then
    echo "✅ Redis cluster stopped"
else
    echo "⚠️  Some nodes may not have stopped properly"
    echo "Check running processes: ps aux | grep redis-server"
fi

# Check for remaining processes
REMAINING_PROCESSES=$(ps aux | grep "[r]edis-server" | grep -E ":(7001|7002|7003)" | wc -l)
if [ $REMAINING_PROCESSES -gt 0 ]; then
    echo "⚠️  Found $REMAINING_PROCESSES remaining Redis processes"
    echo "Kill with: pkill -f 'redis-server.*:700[1-3]'"
fi