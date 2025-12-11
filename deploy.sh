#!/bin/bash

#=====================================================================#
#                   LibreChat Docker Deploy Script                    #
#=====================================================================#
# This script handles deployment of LibreChat with proper .env setup  #
#=====================================================================#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Function to print colored messages
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

# Function to check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi

    # Check if Docker is running
    if ! docker info &> /dev/null; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi

    # Check if docker compose is available
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi

    print_success "All prerequisites are met"
}

# Function to handle .env file
setup_env_file() {
    print_info "Setting up environment file..."

    if [ -f ".env" ]; then
        print_warning ".env file already exists"
        read -p "Do you want to backup and update it? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            BACKUP_FILE=".env.backup.$(date +%Y%m%d_%H%M%S)"
            cp .env "$BACKUP_FILE"
            print_success "Backed up existing .env to $BACKUP_FILE"
        else
            print_info "Using existing .env file"
            return 0
        fi
    fi

    if [ ! -f ".env.example" ]; then
        print_error ".env.example file not found!"
        exit 1
    fi

    # Copy .env.example to .env if .env doesn't exist
    if [ ! -f ".env" ]; then
        cp .env.example .env
        print_success "Created .env from .env.example"
    fi

    print_warning "IMPORTANT: Please configure your .env file with necessary API keys and settings"
    print_info "You can edit it now or later: nano .env"

    read -p "Do you want to edit .env now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ${EDITOR:-nano} .env
    fi
}

# Function to validate .env file
validate_env() {
    print_info "Validating .env configuration..."

    if [ ! -f ".env" ]; then
        print_error ".env file not found!"
        exit 1
    fi

    # Check for critical variables
    if ! grep -q "MONGO_URI=" .env; then
        print_warning "MONGO_URI not found in .env"
    fi

    print_success ".env file validated"
}

# Function to build and pull images
build_and_pull_images() {
    print_info "Building LibreChat with custom changes..."
    docker compose build api
    print_success "LibreChat built successfully"

    print_info "Pulling other Docker images..."
    docker compose pull --ignore-buildable
    print_success "Docker images pulled successfully"
}

# Function to stop existing containers
stop_containers() {
    print_info "Stopping existing containers..."
    docker compose down
    print_success "Containers stopped"
}

# Function to start containers
start_containers() {
    print_info "Starting LibreChat containers..."
    docker compose up -d
    print_success "Containers started successfully"
}

# Function to show status
show_status() {
    print_info "Current container status:"
    echo
    docker compose ps
    echo
}

# Function to wait for services to be ready
wait_for_services() {
    print_info "Waiting for services to be ready..."

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker compose ps | grep -q "Up"; then
            if curl -s http://localhost:3080 > /dev/null 2>&1; then
                print_success "LibreChat is ready!"
                return 0
            fi
        fi

        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done

    echo
    print_warning "Services may still be starting up. Check logs with: docker compose logs -f"
}

# Function to show deployment info
show_deployment_info() {
    echo
    echo "========================================"
    print_success "LibreChat Deployment Complete!"
    echo "========================================"
    echo
    print_info "Access LibreChat at: http://localhost:3080"
    echo
    echo "Useful commands:"
    echo "  - View logs:        docker compose logs -f"
    echo "  - Stop services:    docker compose down"
    echo "  - Restart services: docker compose restart"
    echo "  - Update & redeploy: ./deploy.sh --update"
    echo
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

LibreChat Docker Deployment Script

OPTIONS:
    --help              Show this help message
    --update            Pull latest code and images before deploying
    --build             Force rebuild of LibreChat container
    --no-pull           Skip pulling Docker images (still builds)
    --no-backup         Don't backup existing .env file
    --force             Force deployment without prompts
    --stop              Stop all containers and exit
    --logs              Show container logs after deployment

EXAMPLES:
    $0                  # Standard deployment (build + pull)
    $0 --update         # Update code and deploy
    $0 --build          # Force rebuild
    $0 --stop           # Stop all containers
    $0 --force --logs   # Deploy without prompts and show logs

EOF
}

# Parse command line arguments
UPDATE=false
BUILD=false
NO_PULL=false
NO_BACKUP=false
FORCE=false
STOP_ONLY=false
SHOW_LOGS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --help)
            show_usage
            exit 0
            ;;
        --update)
            UPDATE=true
            shift
            ;;
        --build)
            BUILD=true
            shift
            ;;
        --no-pull)
            NO_PULL=true
            shift
            ;;
        --no-backup)
            NO_BACKUP=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --stop)
            STOP_ONLY=true
            shift
            ;;
        --logs)
            SHOW_LOGS=true
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Main deployment flow
main() {
    echo "========================================"
    echo "  LibreChat Docker Deployment Script"
    echo "========================================"
    echo

    # Check prerequisites
    check_prerequisites

    # If stop only, stop containers and exit
    if [ "$STOP_ONLY" = true ]; then
        stop_containers
        print_success "Containers stopped successfully"
        exit 0
    fi

    # Update from git if requested
    if [ "$UPDATE" = true ]; then
        print_info "Updating from Git repository..."
        git pull
        print_success "Code updated successfully"
    fi

    # Setup .env file
    setup_env_file

    # Validate .env
    validate_env

    # Handle image building and pulling
    if [ "$BUILD" = true ] || [ "$NO_PULL" = false ]; then
        if [ "$NO_PULL" = true ]; then
            # Only build, don't pull
            print_info "Building LibreChat with custom changes..."
            docker compose build api
            print_success "LibreChat built successfully"
        else
            # Build and pull (default)
            build_and_pull_images
        fi
    fi

    # Stop existing containers
    stop_containers

    # Start containers
    start_containers

    # Show status
    show_status

    # Wait for services
    wait_for_services

    # Show deployment info
    show_deployment_info

    # Show logs if requested
    if [ "$SHOW_LOGS" = true ]; then
        print_info "Showing container logs (Ctrl+C to exit)..."
        sleep 2
        docker compose logs -f
    fi
}

# Run main function
main
