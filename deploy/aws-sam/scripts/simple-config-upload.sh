#!/bin/bash

# Simple config upload script - replaces the complex Python approach
# Usage: ./simple-config-upload.sh <stack-name> [region] [config-file]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parameters
STACK_NAME="$1"
REGION="${2:-us-east-1}"
CONFIG_FILE="${3:-librechat.yaml}"

if [[ -z "$STACK_NAME" ]]; then
    print_error "Usage: $0 <stack-name> [region] [config-file]"
    exit 1
fi

print_status "Uploading config for stack: $STACK_NAME"
print_status "Region: $REGION"
print_status "Config file: $CONFIG_FILE"

# Get S3 bucket name from CloudFormation outputs
print_status "Getting S3 bucket name from stack outputs..."
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`S3BucketName`].OutputValue' \
    --output text 2>/dev/null)

if [[ -z "$BUCKET_NAME" ]]; then
    print_error "Could not find S3BucketName in stack outputs"
    exit 1
fi

print_success "Found S3 bucket: $BUCKET_NAME"

# Upload config file to S3
if [[ -f "$CONFIG_FILE" ]]; then
    print_status "Uploading $CONFIG_FILE to S3..."
    aws s3 cp "$CONFIG_FILE" "s3://$BUCKET_NAME/configs/librechat.yaml" \
        --content-type "application/x-yaml" \
        --region "$REGION"
    
    if [[ $? -eq 0 ]]; then
        print_success "Configuration uploaded to s3://$BUCKET_NAME/configs/librechat.yaml"
    else
        print_error "Failed to upload configuration to S3"
        exit 1
    fi
else
    print_error "Config file not found: $CONFIG_FILE"
    exit 1
fi

# Trigger Config Manager Lambda to copy S3 → EFS
LAMBDA_NAME="${STACK_NAME}-config-manager"
print_status "Triggering config manager Lambda: $LAMBDA_NAME"

aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --region "$REGION" \
    --payload '{}' \
    /tmp/lambda-response.json >/dev/null 2>&1

if [[ $? -eq 0 ]]; then
    print_success "Config manager Lambda executed successfully"
    print_status "Configuration has been copied to EFS"
else
    print_error "Could not invoke config manager Lambda"
    exit 1
fi

# Force ECS service to restart containers
print_status "Getting ECS cluster and service information..."
CLUSTER_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ECSClusterName`].OutputValue' \
    --output text 2>/dev/null)

SERVICE_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ECSServiceName`].OutputValue' \
    --output text 2>/dev/null)

if [[ -n "$CLUSTER_NAME" && -n "$SERVICE_NAME" ]]; then
    print_status "Restarting ECS containers to pick up new config..."
    print_status "Cluster: $CLUSTER_NAME"
    print_status "Service: $SERVICE_NAME"
    
    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$SERVICE_NAME" \
        --region "$REGION" \
        --force-new-deployment >/dev/null 2>&1
    
    if [[ $? -eq 0 ]]; then
        print_success "ECS service restart initiated"
        print_status "Containers will restart with the new configuration"
        print_status "This may take a few minutes to complete"
    else
        print_error "Could not restart ECS service"
        exit 1
    fi
else
    print_error "Could not find ECS cluster/service information"
    exit 1
fi

print_success "Configuration update completed successfully!"