#!/bin/bash
# Postiz Deployment Script
# This script ensures images are pulled before deployment

set -e

echo "========================================="
echo "Postiz Deployment Script"
echo "========================================="

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Pull all required images first
echo "Pulling required Docker images..."
docker pull ghcr.io/gitroomhq/postiz-app:latest
docker pull postgres:17-alpine
docker pull redis:7.2
docker pull elasticsearch:7.17.27
docker pull postgres:16
docker pull temporalio/auto-setup:1.28.1
docker pull temporalio/admin-tools:1.28.1-tctl-1.18.4-cli-1.4.1
docker pull temporalio/ui:2.34.0

echo "Images pulled successfully!"
echo ""

# Stop existing containers
echo "Stopping existing containers..."
docker compose down || true

echo ""

# Start services
echo "Starting Postiz services..."
docker compose up -d

echo ""
echo "========================================="
echo "Deployment complete!"
echo "========================================="
echo ""
echo "Services status:"
docker compose ps

echo ""
echo "To view logs: docker compose logs -f postiz"
echo "To restart: docker compose restart postiz"
echo "To stop: docker compose down"
