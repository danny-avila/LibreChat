#!/bin/bash
# Script to add balance to a user by running a one-off ECS task
# Usage: ./scripts/add-balance.sh <user-email> <amount>

set -e

# Check if arguments are provided
if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: $0 <user-email> <amount>"
    echo ""
    echo "Examples:"
    echo "  Add 1000 tokens:  $0 user@domain.com 1000"
    echo "  Add 5000 tokens:  $0 user@domain.com 5000"
    echo ""
    echo "Note: Balance must be enabled in librechat.yaml"
    exit 1
fi

USER_EMAIL="$1"
AMOUNT="$2"

# Validate amount is a number
if ! [[ "$AMOUNT" =~ ^[0-9]+$ ]]; then
    echo "Error: Amount must be a positive number"
    exit 1
fi

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
echo "Adding balance to user: $USER_EMAIL"
echo "Amount: $AMOUNT tokens"
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
echo "Starting ECS task to add balance..."

# Create a Node.js script that mimics the add-balance.js functionality
SHELL_CMD="cd /app/api && cat > add-balance-task.js << 'EOFSCRIPT'
// Setup module-alias like LibreChat does
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname) });

const mongoose = require('mongoose');
const { getBalanceConfig } = require('@librechat/api');
const { User } = require('@librechat/data-schemas').createModels(mongoose);
const { createTransaction } = require('~/models/Transaction');
const { getAppConfig } = require('~/server/services/Config');

const email = '$USER_EMAIL';
const amount = $AMOUNT;

(async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Get app config and balance config
    console.log('Loading configuration...');
    const appConfig = await getAppConfig();
    const balanceConfig = getBalanceConfig(appConfig);
    
    if (!balanceConfig?.enabled) {
      console.error('Error: Balance is not enabled. Use librechat.yaml to enable it');
      await mongoose.connection.close();
      process.exit(1);
    }
    
    // Find the user
    console.log('Looking for user:', email);
    const user = await User.findOne({ email }).lean();
    
    if (!user) {
      console.error('Error: No user with that email was found!');
      await mongoose.connection.close();
      process.exit(1);
    }
    
    console.log('Found user:', user.email);
    
    // Create transaction and update balance
    console.log('Creating transaction for', amount, 'tokens...');
    const result = await createTransaction({
      user: user._id,
      tokenType: 'credits',
      context: 'admin',
      rawAmount: +amount,
      balance: balanceConfig,
    });
    
    if (!result?.balance) {
      console.error('Error: Something went wrong while updating the balance!');
      await mongoose.connection.close();
      process.exit(1);
    }
    
    // Success!
    console.log('✅ Transaction created successfully!');
    console.log('Amount added:', amount);
    console.log('New balance:', result.balance);
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
})();
EOFSCRIPT
node add-balance-task.js"

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
echo "  Log Group: /aws/ecs/${STACK_NAME}"
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
    echo "✅ Success! Added $AMOUNT tokens to $USER_EMAIL"
    echo "Check CloudWatch Logs for the new balance."
else
    echo "❌ Task failed with exit code: $EXIT_CODE"
    echo "Check CloudWatch Logs for details."
    exit 1
fi
