#!/bin/bash
set -e

echo "📦 Starting local build check for x86_64 architecture"
echo "⚙️ This script simulates GitHub Actions environment to catch issues early"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
 echo "❌ Docker is not running. Please start Docker and try again."
 exit 1
fi

# Set up buildx for multi-platform builds
echo "🔧 Setting up Docker buildx..."
BUILDER_NAME="librechat-builder"

# Check if builder exists and remove it
if docker buildx inspect $BUILDER_NAME >/dev/null 2>&1; then
 docker buildx rm $BUILDER_NAME >/dev/null 2>&1
fi

# Create new builder instance
docker buildx create --name $BUILDER_NAME --use --platform linux/amd64 >/dev/null 2>&1

echo "🔍 Starting local build validation..."
echo "⏱️ This might take a few minutes..."

# Run the first build without pushing (--load instead of --push)
# Adding --progress=plain for detailed output
echo "🔄 Running first build (api-build target)..."
if docker buildx build \
 --platform linux/amd64 \
 --tag librechat:local-api-build-test \
 --target api-build \
 --file Dockerfile.multi \
 --load \
 --progress=plain \
 --no-cache \
 .; then
    echo "✅ First build completed successfully!"
    echo "🔄 Running second build (full build)..."
    docker buildx build \
     --platform linux/amd64 \
     --tag librechat:local-test \
     --file Dockerfile.multi \
     --load \
     --progress=plain \
     --no-cache \
     .
else
    echo "❌ First build failed. Skipping second build."
    # Clean up
    echo "🧹 Cleaning up..."
    docker buildx rm $BUILDER_NAME >/dev/null 2>&1
    exit 1
fi

# Clean up
echo "🧹 Cleaning up..."
docker buildx rm $BUILDER_NAME >/dev/null 2>&1

# Remove test images
echo "🗑️ Removing test images..."
docker rmi librechat:local-api-build-test >/dev/null 2>&1 || true
docker rmi librechat:local-test >/dev/null 2>&1 || true

echo "✅ Build completed successfully!"
echo "🚀 Your changes should be ready to push to GitHub"
