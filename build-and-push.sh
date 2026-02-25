#!/bin/bash
set -e

IMAGE="ghcr.io/siteonuk/fleetworx-chat:latest"
BUILDER="multiarch"

echo "🔧 Setting up multi-arch builder..."
docker buildx create --name "$BUILDER" --driver docker-container --use 2>/dev/null || docker buildx use "$BUILDER"

echo "🏗️  Building & pushing multi-arch image: $IMAGE"
echo "    Platforms: linux/amd64, linux/arm64"
echo ""

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f Dockerfile \
  -t "$IMAGE" \
  --push \
  .

echo ""
echo "✅ Done! Image pushed to: $IMAGE"
