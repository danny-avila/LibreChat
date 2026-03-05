#!/usr/bin/env bash
# =============================================================================
# Test script for verifying subdirectory deployment (e.g., /chat/)
#
# Prerequisites:
#   - nginx installed: sudo apt install nginx
#   - LibreChat built:  npm run build
#   - Backend running:  npm run backend (serves built SPA + API on port 3080)
#
# Usage:
#   1. Build + start:        npm run build && npm run backend
#   2. Run this script:      bash config/test-subdirectory-setup.sh start
#   3. Open browser:         http://localhost:8080/chat/
#   4. Cleanup:              bash config/test-subdirectory-setup.sh stop
#
# What to verify:
#   - Accessing http://localhost:8080/chat/ should redirect to /chat/login
#     (NOT /chat/chat/login)
#   - After login, navigating to protected routes should work
#   - Logging out and being redirected should not double the path
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NGINX_CONF="/tmp/librechat-subdir-test-nginx.conf"
NGINX_PID="/tmp/librechat-subdir-test-nginx.pid"

ENV_FILE="${REPO_ROOT}/.env"

write_nginx_conf() {
  cat > "$NGINX_CONF" << 'NGINX'
worker_processes 1;
pid /tmp/librechat-subdir-test-nginx.pid;
error_log /tmp/librechat-subdir-test-nginx-error.log warn;

events {
    worker_connections 64;
}

http {
    access_log /tmp/librechat-subdir-test-nginx-access.log;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    server {
        listen 8080;
        server_name localhost;

        # Subdirectory proxy: strip /chat/ prefix and forward to backend
        location /chat/ {
            proxy_pass http://127.0.0.1:3080/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Redirect bare /chat to /chat/
        location = /chat {
            return 301 /chat/;
        }
    }
}
NGINX
}

start() {
    echo "--- Setting up subdirectory test environment ---"

    # Backup .env if it exists and doesn't have our marker
    if [ -f "$ENV_FILE" ] && ! grep -q '## SUBDIR_TEST_MARKER' "$ENV_FILE"; then
        cp "$ENV_FILE" "${ENV_FILE}.bak-subdir-test"
        echo "Backed up .env to .env.bak-subdir-test"
    fi

    # Ensure DOMAIN_CLIENT and DOMAIN_SERVER are set for subdirectory
    if ! grep -q 'DOMAIN_CLIENT=http://localhost:8080/chat' "$ENV_FILE" 2>/dev/null; then
        echo ""
        echo "You need to set these in your .env file:"
        echo "  DOMAIN_CLIENT=http://localhost:8080/chat"
        echo "  DOMAIN_SERVER=http://localhost:8080/chat"
        echo ""
        echo "Then restart the backend: npm run backend"
        echo ""
    fi

    # Write and start nginx
    write_nginx_conf
    echo "Starting nginx on port 8080 with subdirectory /chat/ ..."

    # Stop any existing test nginx
    if [ -f "$NGINX_PID" ] && kill -0 "$(cat "$NGINX_PID")" 2>/dev/null; then
        nginx -c "$NGINX_CONF" -s stop 2>/dev/null || true
        sleep 1
    fi

    nginx -c "$NGINX_CONF"
    echo "nginx started (PID: $(cat "$NGINX_PID" 2>/dev/null || echo 'unknown'))"
    echo ""
    echo "=== Test URLs ==="
    echo "  Main:     http://localhost:8080/chat/"
    echo "  Login:    http://localhost:8080/chat/login"
    echo "  Expect:   Redirects should go to /chat/login, NOT /chat/chat/login"
    echo ""
    echo "=== Logs ==="
    echo "  Access: /tmp/librechat-subdir-test-nginx-access.log"
    echo "  Error:  /tmp/librechat-subdir-test-nginx-error.log"
    echo ""
    echo "Run '$0 stop' to clean up."
}

stop() {
    echo "--- Cleaning up subdirectory test environment ---"

    if [ -f "$NGINX_PID" ] && kill -0 "$(cat "$NGINX_PID")" 2>/dev/null; then
        nginx -c "$NGINX_CONF" -s stop
        echo "nginx stopped."
    else
        echo "nginx not running."
    fi

    rm -f "$NGINX_CONF" /tmp/librechat-subdir-test-nginx-*.log

    if [ -f "${ENV_FILE}.bak-subdir-test" ]; then
        echo "Restore .env backup: cp ${ENV_FILE}.bak-subdir-test ${ENV_FILE}"
    fi
}

case "${1:-}" in
    start) start ;;
    stop)  stop ;;
    *)
        echo "Usage: $0 {start|stop}"
        exit 1
        ;;
esac
