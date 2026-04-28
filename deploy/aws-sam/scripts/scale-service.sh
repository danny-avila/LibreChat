#!/bin/bash

# Script to manually scale LibreChat ECS service
# Usage: ./scale-service.sh [stack-name] [desired-count]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
STACK_NAME="${1:-librechat}"
DESIRED_COUNT="${2}"
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

# Show usage if desired count not provided
if [[ -z "$DESIRED_COUNT" ]]; then
    echo "Usage: $0 [stack-name] [desired-count]"
    echo ""
    echo "Examples:"
    echo "  $0 librechat 5          # Scale to 5 instances"
    echo "  $0 librechat-dev 1      # Scale dev environment to 1 instance"
    exit 1
fi

# Validate desired count is a number
if ! [[ "$DESIRED_COUNT" =~ ^[0-9]+$ ]]; then
    print_error "Desired count must be a number"
    exit 1
fi

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

print_status "Scaling LibreChat service..."
print_status "Stack: $STACK_NAME"
print_status "Desired Count: $DESIRED_COUNT"
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

# Get current service status
CURRENT_STATUS=$(aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --region "$REGION" \
    --query 'services[0].{
        RunningCount: runningCount,
        PendingCount: pendingCount,
        DesiredCount: desiredCount
    }')

print_status "Current service status:"
echo "$CURRENT_STATUS" | jq .

CURRENT_DESIRED=$(echo "$CURRENT_STATUS" | jq -r '.DesiredCount')

if [[ "$CURRENT_DESIRED" == "$DESIRED_COUNT" ]]; then
    print_warning "Service is already scaled to $DESIRED_COUNT instances"
    exit 0
fi

# Update the service desired count
print_status "Scaling service from $CURRENT_DESIRED to $DESIRED_COUNT instances..."
aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service "$SERVICE_NAME" \
    --desired-count "$DESIRED_COUNT" \
    --region "$REGION" \
    --query 'service.serviceName' \
    --output text

# Wait for deployment to stabilize
print_status "Waiting for service to stabilize..."
aws ecs wait services-stable \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --region "$REGION"

print_success "Service scaling completed successfully!"

# Show final service status
print_status "Final service status:"
aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services "$SERVICE_NAME" \
    --region "$REGION" \
    --query 'services[0].{
        ServiceName: serviceName,
        Status: status,
        RunningCount: runningCount,
        PendingCount: pendingCount,
        DesiredCount: desiredCount
    }' \
    --output table

# Show running tasks
print_status "Running tasks:"
aws ecs list-tasks \
    --cluster "$CLUSTER_NAME" \
    --service-name "$SERVICE_NAME" \
    --region "$REGION" \
    --query 'taskArns' \
    --output table