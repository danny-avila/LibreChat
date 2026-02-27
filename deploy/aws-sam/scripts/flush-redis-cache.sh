#!/bin/bash
# Script to flush Redis cache by running a one-off ECS task
# Usage: ./scripts/flush-redis-cache.sh

set -e

# Load configuration
if [ ! -f .librechat-deploy-config ]; then
    echo "Error: .librechat-deploy-config not found"
    exit 1
fi

source .librechat-deploy-config

# Set variables
CLUSTER_NAME="${STACK_NAME}-cluster"
TASK_FAMILY="${STACK_NAME}-task"
REGION="${REGION:-us-east-1}"

echo "=========================================="
echo "Flushing Redis Cache"
echo "Stack: $STACK_NAME"
echo "Region: $REGION"
echo "=========================================="

# Get VPC configuration from the existing service
echo "Getting network configuration from existing service..."
SERVICE_INFO=$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "${STACK_NAME}-service" \
    --region "$REGION" \
    --query 'services[0].networkConfiguration.awsvpcConfiguration' \
    --output json)

SUBNETS=$(echo "$SERVICE_INFO" | jq -r '.subnets | join(",")')
SECURITY_GROUPS=$(echo "$SERVICE_INFO" | jq -r '.securityGroups | join(",")')

echo "Subnets: $SUBNETS"
echo "Security Groups: $SECURITY_GROUPS"

# Get the task definition
echo "Getting task definition..."
TASK_DEF=$(aws ecs describe-task-definition \
    --task-definition "$TASK_FAMILY" \
    --region "$REGION" \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

echo "Task Definition: $TASK_DEF"

# Run the one-off task
echo "Starting ECS task to flush Redis cache..."

# Inline Node.js script to flush Redis cache
FLUSH_SCRIPT='
const IoRedis = require("ioredis");

const isEnabled = (value) => value === "true" || value === true;

async function flushRedis() {
  try {
    console.log("🔍 Connecting to Redis...");
    
    const urls = (process.env.REDIS_URI || "").split(",").map((uri) => new URL(uri));
    const username = urls[0]?.username || process.env.REDIS_USERNAME;
    const password = urls[0]?.password || process.env.REDIS_PASSWORD;
    
    const redisOptions = {
      username: username,
      password: password,
      connectTimeout: 10000,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
      lazyConnect: false,
    };
    
    const useCluster = urls.length > 1 || isEnabled(process.env.USE_REDIS_CLUSTER);
    let redis;
    
    if (useCluster) {
      const clusterOptions = {
        redisOptions,
        enableOfflineQueue: true,
      };
      
      if (isEnabled(process.env.REDIS_USE_ALTERNATIVE_DNS_LOOKUP)) {
        clusterOptions.dnsLookup = (address, callback) => callback(null, address);
      }
      
      redis = new IoRedis.Cluster(
        urls.map((url) => ({ host: url.hostname, port: parseInt(url.port, 10) || 6379 })),
        clusterOptions,
      );
    } else {
      redis = new IoRedis(process.env.REDIS_URI, redisOptions);
    }
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);
      redis.once("ready", () => { clearTimeout(timeout); resolve(); });
      redis.once("error", (err) => { clearTimeout(timeout); reject(err); });
    });
    
    console.log("✅ Connected to Redis");
    
    let keyCount = 0;
    try {
      if (useCluster) {
        const nodes = redis.nodes("master");
        for (const node of nodes) {
          const keys = await node.keys("*");
          keyCount += keys.length;
        }
      } else {
        const keys = await redis.keys("*");
        keyCount = keys.length;
      }
    } catch (_error) {}
    
    if (useCluster) {
      const nodes = redis.nodes("master");
      await Promise.all(nodes.map((node) => node.flushdb()));
      console.log(`✅ Redis cluster cache flushed successfully (${nodes.length} master nodes)`);
    } else {
      await redis.flushdb();
      console.log("✅ Redis cache flushed successfully");
    }
    
    if (keyCount > 0) {
      console.log(`   Deleted ${keyCount} keys`);
    }
    
    await redis.disconnect();
    console.log("⚠️  Note: All users will need to re-authenticate");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error flushing Redis cache:", error.message);
    process.exit(1);
  }
}

flushRedis();
'

SHELL_CMD="cd /app && node -e '$FLUSH_SCRIPT'"

# Build the overrides JSON using jq for proper escaping
OVERRIDES=$(jq -n \
  --arg cmd "$SHELL_CMD" \
  '{
    containerOverrides: [{
      name: "librechat",
      command: ["sh", "-c", $cmd]
    }]
  }')

echo "Running command in container..."
TASK_ARN=$(aws ecs run-task \
    --cluster "$CLUSTER_NAME" \
    --task-definition "$TASK_DEF" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUPS],assignPublicIp=DISABLED}" \
    --overrides "$OVERRIDES" \
    --region "$REGION" \
    --query 'tasks[0].taskArn' \
    --output text)

echo "Task started: $TASK_ARN"
echo ""
echo "Waiting for task to complete..."
echo "You can monitor the task with:"
echo "  aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN --region $REGION"
echo ""
echo "Or view logs in CloudWatch Logs:"
echo "  Log Group: /ecs/${STACK_NAME}-task"
echo ""

# Wait for task to complete
aws ecs wait tasks-stopped \
    --cluster "$CLUSTER_NAME" \
    --tasks "$TASK_ARN" \
    --region "$REGION"

# Check task exit code
EXIT_CODE=$(aws ecs describe-tasks \
    --cluster "$CLUSTER_NAME" \
    --tasks "$TASK_ARN" \
    --region "$REGION" \
    --query 'tasks[0].containers[0].exitCode' \
    --output text)

if [ "$EXIT_CODE" = "0" ]; then
    echo "✅ Success! Redis cache has been flushed."
    echo ""
    echo "⚠️  Note: All users will need to re-authenticate."
else
    echo "❌ Task failed with exit code: $EXIT_CODE"
    echo "Check CloudWatch Logs for details:"
    echo "  aws logs tail /ecs/${STACK_NAME}-task --follow --region $REGION"
    exit 1
fi
