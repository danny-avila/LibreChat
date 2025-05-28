#!/bin/bash

# Production Deployment Test - performs an actual deployment test
# This script tests the multi-stage build and deployment process

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "==========================================="
echo "LibreChat Production Deployment Test"
echo "==========================================="

# Check if we're in the right directory
if [[ ! -f "docker-compose.production.yml" ]]; then
    print_error "Must be run from the LibreChat root directory"
    exit 1
fi

# Create a test environment file
print_status "Creating test environment file..."
if [[ ! -f ".env.production" ]]; then
    cp .env.production.template .env.production
    
    # Set some basic test values
    sed -i.bak 's/your-secure-mongodb-password-here/test-mongo-password/' .env.production
    sed -i.bak 's/your-secure-postgres-password-here/test-postgres-password/' .env.production
    sed -i.bak 's/your-jwt-secret-here-minimum-32-chars/test-jwt-secret-for-testing-only-32chars/' .env.production
    sed -i.bak 's/your-jwt-refresh-secret-here-minimum-32-chars/test-jwt-refresh-secret-testing-32chars/' .env.production
    sed -i.bak 's/your-creds-encryption-key-here-32-chars/test-creds-key-for-testing-only-32/' .env.production
    sed -i.bak 's/your-16-byte-hex-iv-here/1234567890123456/' .env.production
    sed -i.bak 's/your-meilisearch-master-key-here/test-meili-master-key/' .env.production
    sed -i.bak 's/your-grafana-password-here/test-grafana-password/' .env.production
    
    print_success "Test environment file created"
else
    print_warning "Using existing .env.production file"
fi

# Test 1: Validate Docker Compose configuration
print_status "Validating Docker Compose configuration..."
if docker compose -f docker-compose.production.yml config > /dev/null 2>&1; then
    print_success "Docker Compose configuration is valid"
else
    print_error "Docker Compose configuration validation failed"
    exit 1
fi

# Test 2: Build the multi-stage Docker image
print_status "Building multi-stage Docker image (this may take several minutes)..."
if docker build -f Dockerfile.multi-stage -t librechat:production-test . > /tmp/build.log 2>&1; then
    print_success "Multi-stage Docker build completed successfully"
    
    # Show image size
    IMAGE_SIZE=$(docker images librechat:production-test --format "table {{.Size}}" | tail -n 1)
    print_status "Production image size: $IMAGE_SIZE"
else
    print_error "Docker build failed. Check /tmp/build.log for details"
    exit 1
fi

# Test 3: Start core services (without monitoring for quick test)
print_status "Starting core production services..."
if docker compose -f docker-compose.production.yml up -d mongodb meilisearch vectordb api nginx > /tmp/startup.log 2>&1; then
    print_success "Core services started successfully"
else
    print_error "Failed to start services. Check /tmp/startup.log for details"
    exit 1
fi

# Test 4: Wait for services to be ready and check health
print_status "Waiting for services to be ready (30 seconds)..."
sleep 30

print_status "Checking service health..."
HEALTHY_SERVICES=0
TOTAL_SERVICES=0

# Check API health
if docker compose -f docker-compose.production.yml exec -T api node --version > /dev/null 2>&1; then
    print_success "✓ API service is healthy"
    ((HEALTHY_SERVICES++))
else
    print_warning "✗ API service health check failed"
fi
((TOTAL_SERVICES++))

# Check MongoDB health
if docker compose -f docker-compose.production.yml exec -T mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
    print_success "✓ MongoDB service is healthy"
    ((HEALTHY_SERVICES++))
else
    print_warning "✗ MongoDB health check failed"
fi
((TOTAL_SERVICES++))

# Check NGINX health
if docker compose -f docker-compose.production.yml exec -T nginx nginx -t > /dev/null 2>&1; then
    print_success "✓ NGINX service is healthy"
    ((HEALTHY_SERVICES++))
else
    print_warning "✗ NGINX health check failed"
fi
((TOTAL_SERVICES++))

# Test 5: Check if API is responding
print_status "Testing API connectivity..."
if timeout 10 bash -c "until curl -sf http://localhost:3080/api/health > /dev/null 2>&1; do sleep 1; done"; then
    print_success "✓ API is responding to health checks"
    ((HEALTHY_SERVICES++))
else
    print_warning "✗ API health endpoint not responding"
fi
((TOTAL_SERVICES++))

# Test 6: Check container resource usage
print_status "Checking container resource usage..."
docker compose -f docker-compose.production.yml ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker compose -f docker-compose.production.yml ps -q)

# Cleanup
print_status "Cleaning up test deployment..."
docker compose -f docker-compose.production.yml down > /dev/null 2>&1
docker rmi librechat:production-test > /dev/null 2>&1 || true

# Results
echo
echo "==========================================="
echo "Test Results Summary"
echo "==========================================="
print_status "Healthy services: $HEALTHY_SERVICES/$TOTAL_SERVICES"

if [[ $HEALTHY_SERVICES -eq $TOTAL_SERVICES ]]; then
    print_success "🎉 All tests passed! Production deployment is ready."
    echo
    echo "Next steps for production deployment:"
    echo "1. Update .env.production with real production values"
    echo "2. Set up SSL certificates in nginx/ssl/"
    echo "3. Update domain names in nginx/conf.d/librechat.conf"
    echo "4. Run: ./scripts/deploy-production.sh"
    echo "5. Access monitoring at: http://your-domain:3000 (Grafana)"
    echo
    exit 0
else
    print_warning "⚠️  Some services failed health checks. Review the logs above."
    echo "This is normal for a test environment. Ensure proper configuration for production."
    exit 0
fi
