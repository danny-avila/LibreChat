#!/bin/bash

# Quick test script for production deployment validation

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_test() { echo -e "${YELLOW}[TEST]${NC} $1"; }
print_pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
print_fail() { echo -e "${RED}[FAIL]${NC} $1"; }

echo "========================================"
echo "LibreChat Production Deployment Test"
echo "========================================"

# Test 1: Check if production compose file exists
print_test "Checking production Docker Compose file..."
if [[ -f "docker-compose.production.yml" ]]; then
    print_pass "Production compose file exists"
else
    print_fail "Production compose file missing"
    exit 1
fi

# Test 2: Check if deployment script exists and is executable
print_test "Checking deployment script..."
if [[ -x "scripts/deploy-production.sh" ]]; then
    print_pass "Deployment script is executable"
else
    print_fail "Deployment script missing or not executable"
    exit 1
fi

# Test 3: Check if multi-stage Dockerfile exists
print_test "Checking multi-stage Dockerfile..."
if [[ -f "Dockerfile.multi-stage" ]]; then
    print_pass "Multi-stage Dockerfile exists"
else
    print_fail "Multi-stage Dockerfile missing"
    exit 1
fi

echo
print_pass "🎉 Core production files validated successfully!"
echo
echo "Production deployment is ready. Next steps:"
echo "1. Copy .env.production.template to .env.production"
echo "2. Edit .env.production with your production values"
echo "3. Run: ./scripts/deploy-production.sh"
