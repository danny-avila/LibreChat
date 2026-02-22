#!/bin/bash

# Redis Cluster Startup Script
# This script starts and initializes a 3-node Redis cluster with no replicas

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🚀 Starting Redis Cluster..."

# Create necessary directories
mkdir -p data/7001 data/7002 data/7003
mkdir -p logs

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "❌ Redis is not installed. Please install Redis first:"
    echo "   macOS: brew install redis"
    echo "   Ubuntu: sudo apt-get install redis-server"
    echo "   CentOS: sudo yum install redis"
    exit 1
fi

# Check if Redis CLI is available
if ! command -v redis-cli &> /dev/null; then
    echo "❌ Redis CLI is not available. Please install Redis CLI."
    exit 1
fi

# Start Redis instances
redis-server redis-7001.conf --daemonize yes
redis-server redis-7002.conf --daemonize yes
redis-server redis-7003.conf --daemonize yes

# Wait for nodes to start
sleep 5

# Check if all nodes are running
NODES_RUNNING=0
for port in 7001 7002 7003; do
    if redis-cli -p $port ping &> /dev/null; then
        NODES_RUNNING=$((NODES_RUNNING + 1))
    else
        echo "❌ Node on port $port failed to start"
    fi
done

if [ $NODES_RUNNING -ne 3 ]; then
    echo "❌ Not all Redis nodes started successfully."
    exit 1
fi

echo "✅ All Redis nodes started"

# Check if cluster is already initialized
if redis-cli -p 7001 cluster info 2>/dev/null | grep -q "cluster_state:ok"; then
    echo "✅ Cluster already initialized"
    echo ""
    echo "📋 Usage:"
    echo "  Connect: redis-cli -c -p 7001"
    echo "  Stop: ./stop-cluster.sh"
    exit 0
fi

# Initialize the cluster
echo "🔧 Initializing cluster..."
echo "yes" | redis-cli --cluster create 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 --cluster-replicas 0 2>&1 | tee /tmp/cluster-init.log || {
    echo "❌ Cluster creation command failed. Output:"
    cat /tmp/cluster-init.log
    exit 1
}

# Wait for cluster to stabilize
sleep 5

# Verify cluster status
if redis-cli -p 7001 cluster info | grep -q "cluster_state:ok"; then
    echo "✅ Redis cluster ready!"
    echo ""
    echo "📋 Usage:"
    echo "  Connect: redis-cli -c -p 7001"
    echo "  Stop: ./stop-cluster.sh"
else
    echo "❌ Cluster initialization failed!"
    echo "📊 Cluster info from node 7001:"
    redis-cli -p 7001 cluster info
    echo ""
    echo "📊 Cluster nodes from node 7001:"
    redis-cli -p 7001 cluster nodes
    exit 1
fi