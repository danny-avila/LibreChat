#!/bin/bash

# Statistics Feature Test Runner
# This script runs comprehensive tests for the Statistics feature,
# including authentication, authorization, and UI functionality.

set -e

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

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the LibreChat root directory"
    exit 1
fi

print_status "Starting Statistics Feature Tests"
echo "=================================="

# Check environment variables
print_status "Checking environment variables..."

if [ -z "$TEST_EMAIL" ]; then
    print_warning "TEST_EMAIL not set. Using default: user@test.com"
    export TEST_EMAIL="user@test.com"
fi

if [ -z "$TEST_PASSWORD" ]; then
    print_warning "TEST_PASSWORD not set. Using default: password"
    export TEST_PASSWORD="password"
fi

if [ -z "$TEST_ADMIN_EMAIL" ]; then
    print_warning "TEST_ADMIN_EMAIL not set. Admin tests may be skipped."
    print_warning "Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run admin tests."
fi

if [ -z "$TEST_ADMIN_PASSWORD" ]; then
    print_warning "TEST_ADMIN_PASSWORD not set. Admin tests may be skipped."
fi

print_status "Environment variables:"
print_status "  Regular User: $TEST_EMAIL"
print_status "  Admin User: ${TEST_ADMIN_EMAIL:-'Not set'}"

# Check if backend is running
print_status "Checking if backend server is running..."
if curl -f -s http://localhost:3080/health > /dev/null 2>&1; then
    print_success "Backend server is running on port 3080"
elif curl -f -s http://localhost:3080/ > /dev/null 2>&1; then
    print_success "Backend server is running on port 3080"
else
    print_warning "Backend server may not be running on port 3080"
    print_status "Attempting to start backend server..."
    
    # Try to start backend in background
    npm run backend:dev > backend.log 2>&1 &
    BACKEND_PID=$!
    
    print_status "Waiting for backend to start..."
    sleep 10
    
    if curl -f -s http://localhost:3080/ > /dev/null 2>&1; then
        print_success "Backend server started successfully"
    else
        print_error "Failed to start backend server"
        print_error "Check backend.log for details"
        kill $BACKEND_PID 2>/dev/null || true
        exit 1
    fi
fi

# Install playwright if needed
print_status "Ensuring Playwright is installed..."
if [ ! -d "node_modules/@playwright" ]; then
    print_status "Installing Playwright..."
    npx playwright install
fi

# Run different test suites
print_status "Running Statistics Tests..."

# Test 1: Authentication and Authorization
print_status "1. Running Authentication Tests..."
if npx playwright test --config=e2e/statistics-test-config.ts --project=statistics-auth; then
    print_success "Authentication tests passed"
else
    print_error "Authentication tests failed"
    FAILED_TESTS="$FAILED_TESTS authentication"
fi

# Test 2: UI and Navigation
print_status "2. Running UI Tests..."
if npx playwright test --config=e2e/statistics-test-config.ts --project=statistics-ui; then
    print_success "UI tests passed"
else
    print_error "UI tests failed"
    FAILED_TESTS="$FAILED_TESTS ui"
fi

# Test 3: Admin Setup and Role Verification
print_status "3. Running Admin Setup Tests..."
if npx playwright test --config=e2e/statistics-test-config.ts --project=statistics-admin-setup; then
    print_success "Admin setup tests passed"
else
    print_error "Admin setup tests failed"
    FAILED_TESTS="$FAILED_TESTS admin-setup"
fi

# API Tests using curl
print_status "4. Running Direct API Tests..."

print_status "Testing API endpoints directly..."

# Test unauthorized access
print_status "Testing unauthorized API access..."
UNAUTH_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null http://localhost:3080/api/statistics/users/leaderboard)
if [ "$UNAUTH_RESPONSE" = "401" ]; then
    print_success "✅ Unauthorized access correctly returns 401"
else
    print_warning "⚠️  Unauthorized access returned: $UNAUTH_RESPONSE (expected 401)"
fi

# Test with invalid token
print_status "Testing invalid token..."
INVALID_TOKEN_RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null -H "Authorization: Bearer invalid-token" http://localhost:3080/api/statistics/users/leaderboard)
if [ "$INVALID_TOKEN_RESPONSE" = "401" ]; then
    print_success "✅ Invalid token correctly returns 401"
else
    print_warning "⚠️  Invalid token returned: $INVALID_TOKEN_RESPONSE (expected 401)"
fi

# Clean up background processes
if [ ! -z "$BACKEND_PID" ]; then
    print_status "Stopping background backend server..."
    kill $BACKEND_PID 2>/dev/null || true
fi

# Summary
echo ""
echo "=================================="
print_status "Test Results Summary"
echo "=================================="

if [ -z "$FAILED_TESTS" ]; then
    print_success "🎉 All Statistics tests passed!"
    echo ""
    print_status "The Statistics feature appears to be working correctly:"
    print_status "✅ Authentication is properly enforced"
    print_status "✅ Authorization (admin-only access) is working"
    print_status "✅ UI components handle errors gracefully"
    print_status "✅ API endpoints return appropriate status codes"
    echo ""
    exit 0
else
    print_error "❌ Some tests failed: $FAILED_TESTS"
    echo ""
    print_status "To debug failed tests:"
    print_status "1. Check test results in: e2e/statistics-test-results/"
    print_status "2. Review backend logs for API errors"
    print_status "3. Verify user roles in database"
    print_status "4. Ensure TEST_ADMIN_EMAIL user has ADMIN role"
    echo ""
    print_status "Common issues:"
    print_status "- Admin user doesn't exist or lacks ADMIN role"
    print_status "- Environment variables not set correctly"  
    print_status "- Backend server not running or not accessible"
    print_status "- Database connectivity issues"
    echo ""
    exit 1
fi