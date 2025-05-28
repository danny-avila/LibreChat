#!/bin/bash

# LibreChat Production Deployment Script
# This script deploys the multi-stage Docker solution to production

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

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

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available"
        exit 1
    fi
    
    # Check if production environment file exists
    if [[ ! -f "$ENV_FILE" ]]; then
        print_warning "Production environment file $ENV_FILE not found"
        print_status "Copying template from .env.production.template"
        if [[ -f ".env.production.template" ]]; then
            cp .env.production.template "$ENV_FILE"
            print_warning "Please edit $ENV_FILE with your production values before continuing"
            read -p "Press Enter when ready to continue..."
        else
            print_error "No environment template found. Please create $ENV_FILE"
            exit 1
        fi
    fi
    
    print_success "Prerequisites check completed"
}

# Function to validate environment variables
validate_environment() {
    print_status "Validating environment configuration..."
    
    source "$ENV_FILE"
    
    # Check critical environment variables
    REQUIRED_VARS=(
        "MONGODB_PASSWORD"
        "POSTGRES_PASSWORD"
        "JWT_SECRET"
        "JWT_REFRESH_SECRET"
        "CREDS_KEY"
        "CREDS_IV"
        "MEILI_MASTER_KEY"
        "GRAFANA_PASSWORD"
    )
    
    for var in "${REQUIRED_VARS[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            print_error "Required environment variable $var is not set in $ENV_FILE"
            exit 1
        fi
    done
    
    print_success "Environment validation completed"
}

# Function to create backup
create_backup() {
    print_status "Creating backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup docker volumes if they exist
    if docker volume ls | grep -q librechat; then
        print_status "Backing up Docker volumes..."
        docker run --rm \
            -v mongodb_data:/data/mongodb \
            -v meilisearch_data:/data/meilisearch \
            -v vectordb_data:/data/vectordb \
            -v grafana_data:/data/grafana \
            -v prometheus_data:/data/prometheus \
            -v loki_data:/data/loki \
            -v "$PWD/$BACKUP_DIR":/backup \
            alpine:latest \
            sh -c "cd /data && tar czf /backup/volumes_$(date +%Y%m%d_%H%M%S).tar.gz *"
    fi
    
    # Backup configuration files
    tar czf "$BACKUP_DIR/config_$(date +%Y%m%d_%H%M%S).tar.gz" \
        nginx/ monitoring/ mongodb/ .env* librechat.yaml 2>/dev/null || true
    
    print_success "Backup created at $BACKUP_DIR"
}

# Function to build multi-stage image
build_image() {
    print_status "Building multi-stage Docker image..."
    
    # Build the production image
    docker build \
        --file Dockerfile.multi-stage \
        --target production \
        --tag librechat:production \
        --progress plain \
        .
    
    # Verify the build
    if docker images | grep -q "librechat.*production"; then
        print_success "Multi-stage Docker image built successfully"
        
        # Show image size
        IMAGE_SIZE=$(docker images librechat:production --format "table {{.Size}}" | tail -n 1)
        print_status "Production image size: $IMAGE_SIZE"
    else
        print_error "Failed to build Docker image"
        exit 1
    fi
}

# Function to deploy services
deploy_services() {
    print_status "Deploying services..."
    
    # Create necessary directories
    mkdir -p logs uploads images
    
    # Set proper permissions
    chmod 755 mongodb/init/01-init-librechat.sh
    
    # Pull latest images for external services
    docker compose -f "$COMPOSE_FILE" pull mongodb meilisearch vectordb rag_api nginx prometheus grafana loki promtail
    
    # Deploy with Docker Compose
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d
    
    print_success "Services deployed successfully"
}

# Function to wait for services
wait_for_services() {
    print_status "Waiting for services to be ready..."
    
    # Wait for MongoDB
    print_status "Waiting for MongoDB..."
    timeout 60 bash -c 'until docker exec LibreChat-MongoDB-Production mongosh --eval "db.adminCommand(\"ping\")" &>/dev/null; do sleep 2; done'
    
    # Wait for API
    print_status "Waiting for LibreChat API..."
    timeout 120 bash -c 'until curl -f http://localhost:3080/api/health &>/dev/null; do sleep 5; done'
    
    print_success "All services are ready"
}

# Function to run health checks
run_health_checks() {
    print_status "Running health checks..."
    
    # Check container status
    FAILED_CONTAINERS=$(docker compose -f "$COMPOSE_FILE" ps --filter "status=exited" --format "table {{.Name}}")
    if [[ -n "$FAILED_CONTAINERS" ]]; then
        print_error "Some containers failed to start:"
        echo "$FAILED_CONTAINERS"
        return 1
    fi
    
    # Check API health
    if curl -f http://localhost:3080/api/health &>/dev/null; then
        print_success "LibreChat API is healthy"
    else
        print_error "LibreChat API health check failed"
        return 1
    fi
    
    # Check MongoDB
    if docker exec LibreChat-MongoDB-Production mongosh --eval "db.adminCommand('ping')" &>/dev/null; then
        print_success "MongoDB is healthy"
    else
        print_error "MongoDB health check failed"
        return 1
    fi
    
    # Check NGINX
    if curl -f http://localhost:80 &>/dev/null; then
        print_success "NGINX is healthy"
    else
        print_error "NGINX health check failed"
        return 1
    fi
    
    print_success "All health checks passed"
}

# Function to show deployment status
show_status() {
    print_status "Deployment Status:"
    echo
    
    # Show running containers
    docker compose -f "$COMPOSE_FILE" ps
    echo
    
    # Show exposed ports
    print_status "Exposed Services:"
    echo "LibreChat API: http://localhost:3080"
    echo "NGINX (Web): http://localhost:80"
    echo "Grafana: http://localhost:3000"
    echo "Prometheus: http://localhost:9090"
    echo
    
    # Show image information
    print_status "Docker Images:"
    docker images | grep -E "(librechat|mongo|nginx|grafana|prometheus)"
    echo
    
    # Show volume usage
    print_status "Volume Usage:"
    docker system df -v | grep -E "(mongodb_data|meilisearch_data|vectordb_data)"
}

# Function to cleanup on failure
cleanup_on_failure() {
    print_error "Deployment failed. Cleaning up..."
    docker compose -f "$COMPOSE_FILE" down --remove-orphans
    exit 1
}

# Main deployment function
main() {
    echo "=================================================================="
    echo "         LibreChat Production Deployment (Multi-Stage)"
    echo "=================================================================="
    echo
    
    # Set trap for cleanup on failure
    trap cleanup_on_failure ERR
    
    # Run deployment steps
    check_prerequisites
    validate_environment
    create_backup
    build_image
    deploy_services
    wait_for_services
    run_health_checks
    show_status
    
    echo
    print_success "🎉 Production deployment completed successfully!"
    echo
    print_status "Next steps:"
    echo "1. Configure SSL certificates in nginx/ssl/"
    echo "2. Update your domain in nginx/conf.d/librechat.conf"
    echo "3. Set up monitoring alerts in Grafana"
    echo "4. Test the application thoroughly"
    echo
    print_status "Monitoring URLs:"
    echo "- Grafana Dashboard: http://localhost:3000"
    echo "- Prometheus Metrics: http://localhost:9090"
    echo "- Application: http://localhost:80"
}

# Run main function
main "$@"
