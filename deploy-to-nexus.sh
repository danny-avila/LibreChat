#!/bin/bash

# LibreChat-3T Nexus Deployment Script
# Usage: ./deploy-to-nexus.sh <NEXUS_URL> [IMAGE_TAG]

set -e

# Configuration
IMAGE_NAME="librechat-3t"
DEFAULT_TAG="latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
    echo "Usage: $0 <NEXUS_URL> [IMAGE_TAG]"
    echo ""
    echo "Arguments:"
    echo "  NEXUS_URL    Nexus Docker registry URL (e.g., nexus.example.com:8082)"
    echo "  IMAGE_TAG    Optional image tag (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0 nexus.example.com:8082"
    echo "  $0 nexus.example.com:8082 v0.8.2-rc1"
    echo "  $0 nexus.example.com:8082/repository/docker-hosted v1.0.0"
    exit 1
}

# Check arguments
if [ -z "$1" ]; then
    print_error "Nexus URL is required"
    usage
fi

NEXUS_URL="$1"
IMAGE_TAG="${2:-$DEFAULT_TAG}"

print_info "Nexus URL: $NEXUS_URL"
print_info "Image Tag: $IMAGE_TAG"

# Step 1: Ensure package-lock.json is in sync
print_info "Syncing package-lock.json..."
npm install --silent

# Step 2: Build the Docker image
print_info "Building Docker image..."
docker build -t ${IMAGE_NAME}:latest .

# Step 3: Login to Nexus (will prompt for credentials if not already logged in)
print_info "Logging into Nexus registry..."
docker login ${NEXUS_URL}

# Step 4: Tag the image
print_info "Tagging image for Nexus..."
docker tag ${IMAGE_NAME}:latest ${NEXUS_URL}/${IMAGE_NAME}:${IMAGE_TAG}

# Also tag as latest if a specific version was provided
if [ "$IMAGE_TAG" != "latest" ]; then
    docker tag ${IMAGE_NAME}:latest ${NEXUS_URL}/${IMAGE_NAME}:latest
fi

# Step 5: Push to Nexus
print_info "Pushing image to Nexus..."
docker push ${NEXUS_URL}/${IMAGE_NAME}:${IMAGE_TAG}

if [ "$IMAGE_TAG" != "latest" ]; then
    print_info "Pushing latest tag to Nexus..."
    docker push ${NEXUS_URL}/${IMAGE_NAME}:latest
fi

# Success
echo ""
print_info "Deployment complete!"
echo ""
echo "Image available at:"
echo "  ${NEXUS_URL}/${IMAGE_NAME}:${IMAGE_TAG}"
if [ "$IMAGE_TAG" != "latest" ]; then
    echo "  ${NEXUS_URL}/${IMAGE_NAME}:latest"
fi
echo ""
echo "To pull this image:"
echo "  docker pull ${NEXUS_URL}/${IMAGE_NAME}:${IMAGE_TAG}"
