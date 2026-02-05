#!/bin/bash
# Script to manage user admin role by running a one-off ECS task
# Usage: ./scripts/make-admin.sh <user-email> [--remove]

set -e

# Parse arguments
REMOVE_ADMIN=false
USER_EMAIL=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --remove|-r)
            REMOVE_ADMIN=true
            shift
            ;;
        *)
            USER_EMAIL="$1"
            shift
            ;;
    esac
done

# Check if email is provided
if [ -z "$USER_EMAIL" ]; then
    echo "Usage: $0 <user-email> [--remove]"
    echo ""
    echo "Examples:"
    echo "  Grant admin:  $0 user@domain.com"
    echo "  Remove admin: $0 user@domain.com --remove"
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

if [ "$REMOVE_ADMIN" = true ]; then
    ACTION="Removing admin role from"
    TARGET_ROLE="USER"
else
    ACTION="Granting admin role to"
    TARGET_ROLE="ADMIN"
fi

echo "=========================================="
echo "$ACTION: $USER_EMAIL"
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
echo "Starting ECS task to update user role..."

# Create a Node.js script that uses LibreChat's models with proper module-alias setup
SHELL_CMD="cd /app/api && cat > manage-admin.js << 'EOFSCRIPT'
// Setup module-alias like LibreChat does
const path = require('path');
require('module-alias')({ base: path.resolve(__dirname) });

const mongoose = require('mongoose');
const { updateUser, findUser } = require('~/models');
const { SystemRoles } = require('librechat-data-provider');

const targetRole = '$TARGET_ROLE';

(async () => {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    // Find the user by email
    console.log('Looking for user: $USER_EMAIL');
    const user = await findUser({ email: '$USER_EMAIL' });
    
    if (!user) {
      console.error('User not found: $USER_EMAIL');
      await mongoose.connection.close();
      process.exit(1);
    }
    
    console.log('Found user:', user.email, 'Current role:', user.role);
    
    // Check if already has target role
    if (user.role === targetRole) {
      console.log('User already has ' + targetRole + ' role');
      await mongoose.connection.close();
      process.exit(0);
    }
    
    // Update the user role
    console.log('Updating user role to ' + targetRole + '...');
    const result = await updateUser(user._id, { role: targetRole });
    
    if (result) {
      if (targetRole === 'ADMIN') {
        console.log('✅ User $USER_EMAIL granted ADMIN role successfully');
      } else {
        console.log('✅ User $USER_EMAIL removed from ADMIN role successfully');
      }
      await mongoose.connection.close();
      process.exit(0);
    } else {
      console.error('Failed to update user role');
      await mongoose.connection.close();
      process.exit(1);
    }
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
node manage-admin.js"

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
    if [ "$REMOVE_ADMIN" = true ]; then
        echo "✅ Success! User $USER_EMAIL has been removed from admin role."
    else
        echo "✅ Success! User $USER_EMAIL has been granted admin permissions."
    fi
    echo "The user will need to log out and log back in for changes to take effect."
else
    echo "❌ Task failed with exit code: $EXIT_CODE"
    echo "Check CloudWatch Logs for details."
    exit 1
fi
