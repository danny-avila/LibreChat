#!/bin/bash
set -e

source .env.backend-tests

# Set environment variables for tests
# These will be passed to the Docker container
# In GitHub Actions, these values will come from GitHub secrets
export MONGO_URI="${MONGO_URI}"
export OPENAI_API_KEY="${OPENAI_API_KEY}"
export JWT_SECRET="${JWT_SECRET}"
export CREDS_KEY="${CREDS_KEY}"
export CREDS_IV="${CREDS_IV}"
export BAN_VIOLATIONS="${BAN_VIOLATIONS}"
export BAN_DURATION="${BAN_DURATION}"
export BAN_INTERVAL="${BAN_INTERVAL}"
export NODE_ENV="CI"

# Script to replicate backend tests from Github Actions workflow

echo "Building Docker image for backend tests (targeting amd64)..."
DOCKER_BUILDKIT=1 docker build \
  --platform linux/amd64 \
  --build-arg MONGO_URI \
  --build-arg OPENAI_API_KEY \
  --build-arg JWT_SECRET \
  --build-arg CREDS_KEY \
  --build-arg CREDS_IV \
  --build-arg BAN_VIOLATIONS \
  --build-arg BAN_DURATION \
  --build-arg BAN_INTERVAL \
  --build-arg NODE_ENV=CI \
  -t librechat-backend-test -f Dockerfile .

echo "Creating Docker network for tests..."
NETWORK_NAME="librechat-test-network-$(date +%s)"
docker network create $NETWORK_NAME

echo "Starting MongoDB container..."
MONGO_CONTAINER_NAME="librechat-test-mongodb-$(date +%s)"
docker run -d --name $MONGO_CONTAINER_NAME \
  --network $NETWORK_NAME \
  -e MONGO_INITDB_DATABASE=LibreChat \
  mongo:latest

echo "Creating temporary volume for tests..."
TEMP_VOLUME_NAME="librechat-backend-test-vol-$(date +%s)"
docker volume create $TEMP_VOLUME_NAME

# Update MONGO_URI to point to the MongoDB container
export MONGO_URI="mongodb://$MONGO_CONTAINER_NAME:27017/LibreChat"

echo "Running backend tests in Docker container..."
CONTAINER_ID=$(docker run -d \
  --platform linux/amd64 \
  --network $NETWORK_NAME \
  -v $TEMP_VOLUME_NAME:/app/test-results \
  -e MONGO_URI="$MONGO_URI" \
  -e OPENAI_API_KEY \
  -e JWT_SECRET \
  -e CREDS_KEY \
  -e CREDS_IV \
  -e BAN_VIOLATIONS \
  -e BAN_DURATION \
  -e BAN_INTERVAL \
  -e NODE_ENV=CI \
  librechat-backend-test \
  /bin/sh -c "sleep infinity")

echo "Container started with ID: $CONTAINER_ID"

echo "Installing dependencies..."
docker exec $CONTAINER_ID npm ci

# Install and build required packages
echo "Building Data Provider Package..."
docker exec $CONTAINER_ID npm run build:data-provider

echo "Building MCP Package..."
docker exec $CONTAINER_ID npm run build:mcp

echo "Building Data Schemas Package..."
docker exec $CONTAINER_ID npm run build:data-schemas

# Create empty auth.json file
echo "Creating empty auth.json file..."
docker exec $CONTAINER_ID bash -c "mkdir -p api/data && echo '{}' > api/data/auth.json"

# Check for Circular dependency in rollup
echo "Checking for Circular dependency in rollup..."
docker exec -w /app/packages/data-provider $CONTAINER_ID bash -c "output=\$(npm run rollup:api); echo \"\$output\"; if echo \"\$output\" | grep -q \"Circular dependency\"; then echo \"Error: Circular dependency detected!\"; exit 1; fi"

# Prepare .env.test file
echo "Preparing .env.test file..."
docker exec $CONTAINER_ID bash -c "cp api/test/.env.test.example api/test/.env.test"

# Run all unit tests
echo "Running API unit tests..."
docker exec -w /app/api $CONTAINER_ID npm run test:ci

echo "Running librechat-data-provider unit tests..."
docker exec -w /app/packages/data-provider $CONTAINER_ID npm run test:ci

echo "Running librechat-mcp unit tests..."
docker exec -w /app/packages/mcp $CONTAINER_ID npm run test:ci

# Capture the exit code to know if tests passed or failed
TEST_EXIT_CODE=$?

echo "Tests completed with exit code: $TEST_EXIT_CODE"

# Cleanup
echo "Stopping and removing test container..."
docker stop $CONTAINER_ID
docker rm $CONTAINER_ID

echo "Stopping and removing MongoDB container..."
docker stop $MONGO_CONTAINER_NAME
docker rm $MONGO_CONTAINER_NAME

echo "Removing temporary volume..."
docker volume rm $TEMP_VOLUME_NAME

echo "Removing Docker network..."
docker network rm $NETWORK_NAME

# Return the test exit code
echo "Backend tests completed."
exit $TEST_EXIT_CODE
