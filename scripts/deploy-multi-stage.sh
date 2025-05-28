#!/bin/bash

# Quick deployment script for multi-stage Docker solution
# Usage: ./scripts/deploy-multi-stage.sh

set -e

echo "🚀 Deploying Multi-Stage Docker Solution"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
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

# Check if we're in the right directory
if [ ! -f "Dockerfile.multi-stage" ]; then
    print_error "Dockerfile.multi-stage not found. Are you in the correct directory?"
    exit 1
fi

print_info "Backing up current Dockerfile..."
if [ -f "Dockerfile" ]; then
    cp Dockerfile Dockerfile.backup
    print_success "Current Dockerfile backed up as Dockerfile.backup"
else
    print_warning "No existing Dockerfile found"
fi

print_info "Deploying multi-stage Dockerfile..."
cp Dockerfile.multi-stage Dockerfile
print_success "Multi-stage Dockerfile deployed as Dockerfile"

print_info "Adding changes to git..."
git add Dockerfile

if [ -f "Dockerfile.backup" ]; then
    git add Dockerfile.backup
fi

print_info "Committing changes..."
git commit -m "feat: implement multi-stage Docker build to fix Vite build issue

- Separates build and runtime environments
- Ensures Vite is available during build stage  
- Follows Docker best practices
- Reduces production image size
- Fixes 'Cannot find module vite/bin/vite.js' error

Research: Multi-stage builds are the industry standard solution
for this type of Node.js + build tool deployment issue."

print_success "Changes committed to git"

print_info "Pushing to remote repository..."
git push

print_success "Multi-stage Docker solution deployed!"

echo ""
echo "=============================================="
print_success "🎉 Deployment Complete!"
echo ""
print_info "What happens next:"
echo "  1. Zeabur will automatically detect the new Dockerfile"
echo "  2. It will build using the multi-stage approach"  
echo "  3. The build should complete without Vite errors"
echo "  4. Your application will be deployed successfully"
echo ""
print_warning "Monitor your Zeabur deployment logs to confirm success"
echo ""
print_info "Rollback command (if needed):"
echo "  mv Dockerfile.backup Dockerfile && git add Dockerfile && git commit -m 'rollback: revert multi-stage build' && git push"
