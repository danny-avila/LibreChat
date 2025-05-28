#!/bin/bash

# LibreChat Production Management Script
# Provides common management operations for the production deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    cat << EOF
LibreChat Production Management

Usage: $0 [COMMAND]

Commands:
    status          Show deployment status
    logs [service]  Show logs for all services or specific service
    restart         Restart all services
    stop            Stop all services
    start           Start all services
    update          Update and redeploy
    backup          Create backup
    restore [file]  Restore from backup
    scale [service] [count]  Scale a service
    health          Run health checks
    cleanup         Clean up unused Docker resources
    monitor         Open monitoring dashboard
    shell [service] Open shell in service container

Examples:
    $0 status
    $0 logs api
    $0 restart
    $0 scale api 2
    $0 backup
EOF
}

get_service_status() {
    print_status "Service Status:"
    docker compose -f "$COMPOSE_FILE" ps
}

show_logs() {
    local service=${1:-}
    if [[ -n "$service" ]]; then
        print_status "Showing logs for $service..."
        docker compose -f "$COMPOSE_FILE" logs -f "$service"
    else
        print_status "Showing logs for all services..."
        docker compose -f "$COMPOSE_FILE" logs -f
    fi
}

restart_services() {
    print_status "Restarting services..."
    docker compose -f "$COMPOSE_FILE" restart
    print_success "Services restarted"
}

stop_services() {
    print_status "Stopping services..."
    docker compose -f "$COMPOSE_FILE" down
    print_success "Services stopped"
}

start_services() {
    print_status "Starting services..."
    docker compose -f "$COMPOSE_FILE" up -d
    print_success "Services started"
}

update_deployment() {
    print_status "Updating deployment..."
    
    # Create backup first
    backup_data
    
    # Build new image
    print_status "Building updated image..."
    docker build --file Dockerfile.multi-stage --target production --tag librechat:production .
    
    # Rolling update
    print_status "Performing rolling update..."
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate api
    
    # Wait for health check
    sleep 30
    if run_health_checks; then
        print_success "Update completed successfully"
    else
        print_error "Update failed health checks"
        return 1
    fi
}

backup_data() {
    local backup_dir="./backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    print_status "Creating backup at $backup_dir..."
    
    # Backup volumes
    docker run --rm \
        -v mongodb_data:/data/mongodb \
        -v meilisearch_data:/data/meilisearch \
        -v vectordb_data:/data/vectordb \
        -v grafana_data:/data/grafana \
        -v prometheus_data:/data/prometheus \
        -v loki_data:/data/loki \
        -v "$PWD/$backup_dir":/backup \
        alpine:latest \
        sh -c "cd /data && tar czf /backup/volumes_$(date +%Y%m%d_%H%M%S).tar.gz *"
    
    # Backup configs
    tar czf "$backup_dir/config_$(date +%Y%m%d_%H%M%S).tar.gz" \
        nginx/ monitoring/ mongodb/ .env* librechat.yaml 2>/dev/null || true
    
    print_success "Backup created at $backup_dir"
}

restore_data() {
    local backup_file=${1:-}
    if [[ -z "$backup_file" ]]; then
        print_error "Please specify backup file"
        return 1
    fi
    
    if [[ ! -f "$backup_file" ]]; then
        print_error "Backup file $backup_file not found"
        return 1
    fi
    
    print_warning "This will overwrite current data. Are you sure? (y/N)"
    read -r response
    if [[ "$response" != "y" && "$response" != "Y" ]]; then
        print_status "Restore cancelled"
        return 0
    fi
    
    print_status "Stopping services for restore..."
    docker compose -f "$COMPOSE_FILE" down
    
    print_status "Restoring from $backup_file..."
    docker run --rm \
        -v mongodb_data:/data/mongodb \
        -v meilisearch_data:/data/meilisearch \
        -v vectordb_data:/data/vectordb \
        -v grafana_data:/data/grafana \
        -v prometheus_data:/data/prometheus \
        -v loki_data:/data/loki \
        -v "$PWD/$(dirname "$backup_file")":/backup \
        alpine:latest \
        sh -c "cd /data && tar xzf /backup/$(basename "$backup_file")"
    
    print_status "Starting services..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    print_success "Restore completed"
}

scale_service() {
    local service=${1:-}
    local count=${2:-}
    
    if [[ -z "$service" || -z "$count" ]]; then
        print_error "Usage: scale [service] [count]"
        return 1
    fi
    
    print_status "Scaling $service to $count instances..."
    docker compose -f "$COMPOSE_FILE" up -d --scale "$service=$count" "$service"
    print_success "Service $service scaled to $count instances"
}

run_health_checks() {
    print_status "Running health checks..."
    
    local failed=0
    
    # Check API health
    if curl -f http://localhost:3080/api/health &>/dev/null; then
        print_success "✓ LibreChat API is healthy"
    else
        print_error "✗ LibreChat API health check failed"
        failed=1
    fi
    
    # Check MongoDB
    if docker exec LibreChat-MongoDB-Production mongosh --eval "db.adminCommand('ping')" &>/dev/null; then
        print_success "✓ MongoDB is healthy"
    else
        print_error "✗ MongoDB health check failed"
        failed=1
    fi
    
    # Check NGINX
    if curl -f http://localhost:80 &>/dev/null; then
        print_success "✓ NGINX is healthy"
    else
        print_error "✗ NGINX health check failed"
        failed=1
    fi
    
    # Check Grafana
    if curl -f http://localhost:3000/api/health &>/dev/null; then
        print_success "✓ Grafana is healthy"
    else
        print_warning "⚠ Grafana health check failed"
    fi
    
    if [[ $failed -eq 0 ]]; then
        print_success "All critical health checks passed"
        return 0
    else
        print_error "Some health checks failed"
        return 1
    fi
}

cleanup_resources() {
    print_status "Cleaning up unused Docker resources..."
    
    # Clean up unused containers
    docker container prune -f
    
    # Clean up unused images
    docker image prune -f
    
    # Clean up unused volumes (be careful with this)
    print_warning "Clean up unused volumes? This could delete data! (y/N)"
    read -r response
    if [[ "$response" == "y" || "$response" == "Y" ]]; then
        docker volume prune -f
    fi
    
    # Clean up unused networks
    docker network prune -f
    
    print_success "Cleanup completed"
}

open_monitoring() {
    print_status "Opening monitoring dashboard..."
    if command -v open &> /dev/null; then
        open http://localhost:3000  # Grafana
    elif command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3000
    else
        print_status "Please open http://localhost:3000 in your browser"
    fi
}

open_shell() {
    local service=${1:-api}
    print_status "Opening shell in $service container..."
    
    local container_name
    case "$service" in
        api) container_name="LibreChat-API-Production" ;;
        mongodb) container_name="LibreChat-MongoDB-Production" ;;
        nginx) container_name="LibreChat-NGINX-Production" ;;
        grafana) container_name="LibreChat-Grafana" ;;
        prometheus) container_name="LibreChat-Prometheus" ;;
        *) container_name="$service" ;;
    esac
    
    docker exec -it "$container_name" /bin/sh
}

# Main function
main() {
    case "${1:-}" in
        status)
            get_service_status
            ;;
        logs)
            show_logs "${2:-}"
            ;;
        restart)
            restart_services
            ;;
        stop)
            stop_services
            ;;
        start)
            start_services
            ;;
        update)
            update_deployment
            ;;
        backup)
            backup_data
            ;;
        restore)
            restore_data "${2:-}"
            ;;
        scale)
            scale_service "${2:-}" "${3:-}"
            ;;
        health)
            run_health_checks
            ;;
        cleanup)
            cleanup_resources
            ;;
        monitor)
            open_monitoring
            ;;
        shell)
            open_shell "${2:-}"
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: ${1:-}"
            echo
            show_help
            exit 1
            ;;
    esac
}

# Check if Docker Compose file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
    print_error "Docker Compose file $COMPOSE_FILE not found"
    exit 1
fi

main "$@"
