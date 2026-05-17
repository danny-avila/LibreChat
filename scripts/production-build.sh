#!/bin/bash

# Production Build & Deploy Script for LibreChat with Ollama
# This script prepares and builds the application for production deployment

set -e

echo "=========================================="
echo "  LibreChat + Ollama Production Build"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        echo -e "  ${GREEN}✓${NC} Node.js: $NODE_VERSION"
    else
        echo -e "  ${RED}✗${NC} Node.js not found"
        exit 1
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm -v)
        echo -e "  ${GREEN}✓${NC} npm: $NPM_VERSION"
    else
        echo -e "  ${RED}✗${NC} npm not found"
        exit 1
    fi
    
    # Check Docker
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        echo -e "  ${GREEN}✓${NC} Docker: $DOCKER_VERSION"
    else
        echo -e "  ${YELLOW}!${NC} Docker not found (required for containerized deployment)"
    fi
    
    # Check Docker Compose
    if command -v docker compose &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Docker Compose: available"
    elif command -v docker-compose &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} docker-compose: available"
    else
        echo -e "  ${YELLOW}!${NC} Docker Compose not found"
    fi
}

# Setup environment
setup_environment() {
    echo ""
    echo "Setting up environment..."
    
    # Check if .env exists
    if [ ! -f .env ]; then
        if [ -f .env.example ]; then
            cp .env.example .env
            echo -e "  ${GREEN}✓${NC} Created .env from .env.example"
            echo -e "  ${YELLOW}!${NC} Please configure your .env file before deploying"
        else
            echo -e "  ${RED}✗${NC} No .env.example found"
            exit 1
        fi
    else
        echo -e "  ${GREEN}✓${NC} .env file exists"
    fi
    
    # Check if librechat.yaml exists
    if [ ! -f librechat.yaml ]; then
        echo -e "  ${RED}✗${NC} librechat.yaml not found"
        echo "  Please ensure librechat.yaml is properly configured"
        exit 1
    else
        echo -e "  ${GREEN}✓${NC} librechat.yaml exists"
    fi
}

# Install dependencies
install_dependencies() {
    echo ""
    echo "Installing dependencies..."
    npm install
    echo -e "  ${GREEN}✓${NC} Dependencies installed"
}

# Build packages
build_packages() {
    echo ""
    echo "Building packages..."
    npm run build:packages
    echo -e "  ${GREEN}✓${NC} Packages built"
}

# Build frontend
build_frontend() {
    echo ""
    echo "Building frontend..."
    npm run build:client
    echo -e "  ${GREEN}✓${NC} Frontend built"
}

# Full build
full_build() {
    echo ""
    echo "Running full build..."
    npm run build
    echo -e "  ${GREEN}✓${NC} Full build complete"
}

# Docker build
docker_build() {
    echo ""
    echo "Building Docker images..."
    docker compose build
    echo -e "  ${GREEN}✓${NC} Docker images built"
}

# Start production
start_production() {
    echo ""
    echo "Starting production services..."
    docker compose up -d
    echo -e "  ${GREEN}✓${NC} Services started"
    
    echo ""
    echo "Waiting for services to be ready..."
    sleep 10
    
    # Check health
    if curl -s http://localhost:3080 > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} LibreChat is running at http://localhost:3080"
    else
        echo -e "  ${YELLOW}!${NC} LibreChat may still be starting..."
    fi
    
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Ollama is running at http://localhost:11434"
    else
        echo -e "  ${YELLOW}!${NC} Ollama may still be starting..."
    fi
}

# Show help
show_help() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  check     - Check prerequisites"
    echo "  setup     - Setup environment files"
    echo "  install   - Install npm dependencies"
    echo "  build     - Build all packages and frontend"
    echo "  docker    - Build Docker images"
    echo "  start     - Start production services"
    echo "  all       - Run complete production build and start"
    echo "  help      - Show this help message"
    echo ""
}

# Main
main() {
    local command="${1:-all}"
    
    case $command in
        check)
            check_prerequisites
            ;;
        setup)
            setup_environment
            ;;
        install)
            install_dependencies
            ;;
        build)
            build_packages
            build_frontend
            ;;
        docker)
            docker_build
            ;;
        start)
            start_production
            ;;
        all)
            check_prerequisites
            setup_environment
            docker_build
            start_production
            
            echo ""
            echo "=========================================="
            echo "  Production Deployment Complete!"
            echo "=========================================="
            echo ""
            echo "Access LibreChat: http://localhost:3080"
            echo ""
            echo "To setup Ollama models, run:"
            echo "  ./scripts/setup-ollama.sh"
            echo ""
            echo "Available services:"
            echo "  - LibreChat:    http://localhost:3080"
            echo "  - Ollama:       http://localhost:11434"
            echo "  - MongoDB:      mongodb://localhost:27017"
            echo "  - MeiliSearch:  http://localhost:7700"
            echo ""
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
