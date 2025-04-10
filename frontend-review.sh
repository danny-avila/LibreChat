#!/bin/bash
set -e

# Script to replicate frontend tests from Github Actions workflow

echo "Building Docker image for frontend tests (targeting amd64)..."
DOCKER_BUILDKIT=1 docker build --platform linux/amd64 -t librechat-frontend-test -f Dockerfile .

echo "Creating temporary volume for tests..."
TEMP_VOLUME_NAME="librechat-frontend-test-vol-$(date +%s)"
docker volume create $TEMP_VOLUME_NAME

echo "Running frontend tests in Docker container..."
CONTAINER_ID=$(docker run -d \
  --platform linux/amd64 \
  -v $TEMP_VOLUME_NAME:/app/test-results \
  librechat-frontend-test \
  /bin/sh -c "sleep infinity")

echo "Container started with ID: $CONTAINER_ID"

echo "Installing dependencies..."
docker exec $CONTAINER_ID npm ci

echo "Building client for tests..."
docker exec $CONTAINER_ID npm run frontend:ci

echo "Running unit tests..."
docker exec -w /app/client $CONTAINER_ID npm run test:ci --verbose

# Capture the exit code to know if tests passed or failed
TEST_EXIT_CODE=$?

echo "Tests completed with exit code: $TEST_EXIT_CODE"

# Cleanup
echo "Stopping and removing container..."
docker stop $CONTAINER_ID
docker rm $CONTAINER_ID

echo "Removing temporary volume..."
docker volume rm $TEMP_VOLUME_NAME

# Return the test exit code
echo "Frontend tests completed."
exit $TEST_EXIT_CODE