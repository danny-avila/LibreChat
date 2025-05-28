#!/bin/bash

echo "🚀 Testing Multi-Stage Docker Build for LibreChat"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

print_status "Docker is running ✓"

# Build the multi-stage image
print_status "Building multi-stage Docker image..."
if docker build -f Dockerfile.multi-stage -t librechat:multi-stage .; then
    print_success "Multi-stage Docker image built successfully!"
else
    print_error "Failed to build multi-stage Docker image"
    exit 1
fi

# Check image size
print_status "Checking image size..."
IMAGE_SIZE=$(docker images librechat:multi-stage --format "table {{.Size}}" | tail -n +2)
print_success "Image size: $IMAGE_SIZE"

# Test the build by running a quick container check
print_status "Testing the built image..."
if docker run --rm librechat:multi-stage node --version; then
    print_success "Container can run Node.js ✓"
else
    print_error "Container failed to run Node.js"
    exit 1
fi

# Check if client/dist exists in the image
print_status "Checking if client build artifacts exist..."
if docker run --rm librechat:multi-stage test -d client/dist; then
    print_success "Client build artifacts exist ✓"
else
    print_error "Client build artifacts not found"
    exit 1
fi

# Check if node_modules has only production dependencies
print_status "Checking node_modules content..."
DEV_DEPS=$(docker run --rm librechat:multi-stage sh -c "find node_modules -name 'vite' -type d | wc -l")
if [ "$DEV_DEPS" -eq "0" ]; then
    print_success "Vite (dev dependency) not found in production image ✓"
else
    print_warning "Vite found in production image (this might be intentional if used in production)"
fi

print_status "Listing packages in client directory..."
docker run --rm librechat:multi-stage ls -la client/

print_status "Checking if client/dist has built files..."
CLIENT_FILES=$(docker run --rm librechat:multi-stage sh -c "find client/dist -name '*.js' -o -name '*.css' | wc -l")
if [ "$CLIENT_FILES" -gt "0" ]; then
    print_success "Client build files found: $CLIENT_FILES files ✓"
else
    print_error "No client build files found"
    exit 1
fi

echo ""
echo "=================================================="
print_success "Multi-stage Docker build test completed successfully!"
echo ""
print_status "The multi-stage approach provides several benefits:"
echo "  • Separates build and runtime environments"
echo "  • Ensures Vite is available during build phase"
echo "  • Removes dev dependencies from final image"
echo "  • Follows Docker best practices"
echo "  • Reduces final image size"
echo ""
print_status "To use this build for deployment:"
echo "  1. Replace your existing Dockerfile with Dockerfile.multi-stage"
echo "  2. Update your build scripts to use the new Dockerfile"
echo "  3. Deploy with: docker build -f Dockerfile.multi-stage -t librechat ."
echo ""
print_warning "Remember to test thoroughly in your deployment environment!"
