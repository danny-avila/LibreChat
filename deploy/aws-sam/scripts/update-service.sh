#!/bin/bash

# Script to update LibreChat ECS service with new image version
# Usage: ./update-service.sh [stack-name] [image-tag]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STACK_NAME="${1:-librechat}"
IMAGE_TAG="${2:-latest}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI is not installed"
    exit 1
fi

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    print_error "AWS credentials not configured"
    exit 1
fi

print_status "Updating LibreChat service..."
print_status "Stack: $STACK_NAME"
print_status "Image Tag: $IMAGE_TAG"
print_status "Region: $REGION"

# Get cluster and service names from CloudFormation
CLUSTER_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ECSClusterName`].OutputValue' \
    --output text)

SERVICE_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ECSServiceName`].OutputValue' \
    --output text)

if [[ -z "$CLUSTER_NAME" || -z "$SERVICE_NAME" ]]; then
    print_error "Could not find ECS cluster or service in stack $STACK_NAME"
    exit 1
fi

print_status "Cluster: $CLUSTER_NAME"
print_status "Service: $SERVICE_NAME"

# Get current task definition
TASK_DEF_ARN=$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --region "$REGION" \
    --query 'services[0].taskDefinition' \
    --output text)

print_status "Current task definition: $TASK_DEF_ARN"

# Get task definition details
TASK_DEF=$(aws ecs describe-task-definition \
    --task-definition "$TASK_DEF_ARN" \
    --region "$REGION" \
    --query 'taskDefinition')

# Update the image in the task definition
NEW_IMAGE="ghcr.io/danny-avila/librechat:$IMAGE_TAG"
UPDATED_TASK_DEF=$(echo "$TASK_DEF" | jq --arg image "$NEW_IMAGE" '
    .containerDefinitions[0].image = $image |
    del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .placementConstraints, .compatibilities, .registeredAt, .registeredBy)
')

print_status "Updating image to: $NEW_IMAGE"

# Register new task definition
NEW_TASK_DEF_ARN=$(echo "$UPDATED_TASK_DEF" | aws ecs register-task-definition \
    --region "$REGION" \
    --cli-input-json file:///dev/stdin \
    --query 'taskDefinition.taskDefinitionArn' \
    --output text)

print_status "New task definition: $NEW_TASK_DEF_ARN"

# Update the service
print_status "Updating ECS service..."
aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$SERVICE_NAME" \
    --task-definition "$NEW_TASK_DEF_ARN" \
    --region "$REGION" \
    --query 'service.serviceName' \
    --output text

# Wait for deployment to complete
print_status "Waiting for deployment to complete..."
aws ecs wait services-stable \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --region "$REGION"

print_success "Service update completed successfully!"

# Show service status
print_status "Service status:"
aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --region "$REGION" \
    --query 'services[0].{
        ServiceName: serviceName,
        Status: status,
        RunningCount: runningCount,
        PendingCount: pendingCount,
        DesiredCount: desiredCount,
        TaskDefinition: taskDefinition
    }' \
    --output table