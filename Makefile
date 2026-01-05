.PHONY: help setup install build up down restart logs clean rebuild ollama-models ollama-pull-qwen ollama-pull-llama ldap-up ldap-down ldap-test ldap-integration-test keycloak-up keycloak-down keycloak-test

ROOT_DIR := $(shell pwd)

# Default target
help:
	@echo "Bintybyte - LibreChat Makefile Commands"
	@echo "========================================"
	@echo ""
	@echo "Setup Commands:"
	@echo "  make setup          - Complete setup (creates .env, override files)"
	@echo "  make install        - Install dependencies"
	@echo ""
	@echo "Docker Commands:"
	@echo "  make build          - Build Docker containers"
	@echo "  make ensure-volumes  - Prep host volume folders to .env UID/GID"
	@echo "  make up             - Start all services and pull Ollama models"
	@echo "  make down           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make rebuild        - Rebuild, restart services, and pull Ollama models"
	@echo ""
	@echo "Ollama Commands:"
	@echo "  make ollama-models  - Pull all Ollama models (qwen, llama3.2)"
	@echo "  make ollama-pull-qwen   - Pull Qwen model"
	@echo "  make ollama-pull-llama  - Pull Llama 3.2 model"
	@echo "  make ollama-list    - List installed Ollama models"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make logs           - View container logs (all services)"
	@echo "  make logs-api       - View API container logs"
	@echo "  make logs-db        - View MongoDB container logs"
	@echo "  make logs-ollama    - View Ollama container logs"
	@echo "  make list-users     - List LDAP users in the configured users OU"
	@echo "  make list-services  - Show container/service statuses from docker compose"
	@echo "  make auth-guardrails-test - Run auth guardrail seed validations (reports/auth-guardrails.txt)"
	@echo "  make clean          - Remove containers, volumes, and images"
	@echo "  make shell          - Open shell in API container"
	@echo "  make shell-ollama   - Open shell in Ollama container"
	@echo ""
	@echo "MCP Commands:"
	@echo "  make mcp-start      - Start MCP ClickHouse server"
	@echo "  make mcp-stop       - Stop MCP ClickHouse server"
	@echo "  make mcp-logs       - View MCP ClickHouse logs"
	@echo ""
	@echo "Development Commands:"
	@echo "  make dev            - Start in development mode"
	@echo "  make ps             - Show running containers"
	@echo "  make reset          - Reset database and restart"
	@echo "  make health         - Check health status of all services"
	@echo ""
	@echo "SSO Commands:"
	@echo "  make ldap-up        - Start LDAP service only"
	@echo "  make ldap-down      - Stop LDAP service"
	@echo "  make ldap-test      - Run a simple LDAP search"
	@echo "  make ldap-integration-test - Ensure ssouser exists and Keycloak responds"
	@echo "  make keycloak-up    - Start Keycloak and its Postgres database"
	@echo "  make keycloak-down  - Stop Keycloak services"
	@echo "  make keycloak-test  - Check Keycloak admin health endpoint"
	@echo "  make add-ldap-user  - Seed ssouser (default) or pass USERNAME=..., EMAIL=..., etc. to create/update LDAP users"

# Complete setup
setup:
	@echo "Setting up Bintybyte LibreChat..."
	@if [ ! -f .env ]; then \
		echo "Creating .env file from .env.example..."; \
		cp .env.example .env; \
		echo ".env file created with all default values."; \
	else \
		echo ".env file already exists. Skipping..."; \
	fi
	@if [ ! -f docker-compose.override.yml ]; then \
		bash scripts/add-ldap-user.sh list; \
		echo "      - 8001:8000" >> docker-compose.override.yml; \
		echo "    extra_hosts:" >> docker-compose.override.yml; \
		echo "      - \"host.docker.internal:host-gateway\"" >> docker-compose.override.yml; \
		services=$$(docker compose config --services 2>/dev/null); \
		if [ -z "$$services" ]; then \
			echo "⚠️  Unable to read services from docker compose config."; \
			exit 1; \
		fi; \
		states=$$(docker compose ps --format '{{.Service}}\t{{.State}}' 2>/dev/null); \
		printf '%-30s %s\n' "SERVICE" "STATUS"; \
		printf '%-30s %s\n' "-------" "------"; \
		for svc in $$services; do \
			status=$$(printf '%s\n' "$$states" | awk -v service="$$svc" 'BEGIN {st="not created"} $1==service {st=$2; for (i=3;i<=NF;i++) st=st" " $i} END {print st}'); \
			if [ -z "$$status" ]; then status="not created"; fi; \
			printf '%-30s %s\n' "$$svc" "$$status"; \
		done; \
		sed -i.bak 's/use: false/use: true/' librechat.yaml && rm -f librechat.yaml.bak; \
		echo "" >> librechat.yaml; \
		echo "# MCP Servers Configuration" >> librechat.yaml; \
		echo "# ClickHouse MCP Server for database queries and analytics" >> librechat.yaml; \
		echo "mcpServers:" >> librechat.yaml; \
		echo "  mcp-clickhouse:" >> librechat.yaml; \
		echo "    type: sse" >> librechat.yaml; \
		echo "    url: http://host.docker.internal:8001/sse" >> librechat.yaml; \
		echo "" >> librechat.yaml; \
		echo "# Web Search Configuration" >> librechat.yaml; \
		echo "webSearch:" >> librechat.yaml; \
		echo "  # Jina Reranking" >> librechat.yaml; \
		echo "  jinaApiKey: '\$${JINA_API_KEY}'" >> librechat.yaml; \
		echo "  jinaApiUrl: '\$${JINA_API_URL}'" >> librechat.yaml; \
		echo "  # Other rerankers" >> librechat.yaml; \
		echo "  cohereApiKey: '\$${COHERE_API_KEY}'" >> librechat.yaml; \
		echo "  # Search providers" >> librechat.yaml; \
		echo "  serperApiKey: '\$${SERPER_API_KEY}'" >> librechat.yaml; \
		echo "  searxngInstanceUrl: '\$${SEARXNG_INSTANCE_URL}'" >> librechat.yaml; \
		echo "  searxngApiKey: '\$${SEARXNG_API_KEY}'" >> librechat.yaml; \
		echo "  # Content scrapers" >> librechat.yaml; \
		echo "  firecrawlApiKey: '\$${FIRECRAWL_API_KEY}'" >> librechat.yaml; \
		echo "  firecrawlApiUrl: '\$${FIRECRAWL_API_URL}'" >> librechat.yaml; \
		echo "  # Search categories" >> librechat.yaml; \
		echo "  images: true" >> librechat.yaml; \
		echo "  news: true" >> librechat.yaml; \
		echo "  videos: true" >> librechat.yaml; \
		echo "librechat.yaml created with MCP ClickHouse, WebSearch, and simplified auth."; \
	else \
		echo "librechat.yaml already exists. Skipping..."; \
	fi
	@echo ""
	@echo "✅ Configuration files created:"
	@echo "   - .env (from .env.example with all settings)"
	@echo "   - docker-compose.override.yml (with librechat.yaml mount)"
	@echo "   - librechat.yaml (with Groq, Mistral, OpenRouter, Helicone, Portkey, MCP, WebSearch)"
	@echo ""
	@echo "✅ Setup complete!"
	@$(MAKE) ensure-volumes
	@echo ""
	@echo "📝 Next steps:"
	@echo "1. Add your API keys to .env:"
	@echo "   - OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_KEY"
	@echo "   - GROQ_API_KEY, MISTRAL_API_KEY, OPENROUTER_KEY"
	@echo "   - HELICONE_KEY, PORTKEY_API_KEY, PORTKEY_OPENAI_VIRTUAL_KEY"
	@echo ""
	@echo "2. Build and start services:"
	@echo "   make build && make up"
	@echo ""
	@echo "Or use: make rebuild"

# Install dependencies
install:
	@echo "Installing dependencies..."
	@if ! command -v npm >/dev/null 2>&1; then \
		echo "npm is required but not installed. Please install Node.js/npm first."; \
		exit 1; \
	fi
	npm install
	cd api && npm install
	cd client && npm install

# Build Docker containers
build:
	@echo "Building Docker containers..."
	docker compose build

# Align host volume ownership with the UID/GID declared in .env.
ensure-volumes:
	@echo "Preparing host volume directories..."
	@./scripts/ensure-volume-permissions.sh

# Start services
up:
	@$(MAKE) ensure-volumes
	@echo "Starting Bintybyte LibreChat services..."
	docker compose up -d
	@echo ""
	@echo "✅ Services started successfully!"
	@echo ""
	@echo "🤖 Pulling Ollama models (this may take a few minutes)..."
	@sleep 5
	@$(MAKE) ollama-models || echo "⚠️  Warning: Ollama models pull failed. You can manually pull them with 'make ollama-models'"
	@echo ""
	@echo "🌐 Access LibreChat at: http://localhost:3080"
	@echo "📊 Access MCP ClickHouse at: http://localhost:8001"
	@echo ""
	@echo "💡 Tip: Run 'make logs' to view all container logs"
	@echo "💡 Tip: Run 'make health' to check service status"

# Stop services
down:
	@echo "Stopping services..."
	docker compose down
	@echo "✅ All services stopped"

# Restart services
restart:
	@echo "Restarting services..."
	@$(MAKE) down
	@sleep 2
	@$(MAKE) up

# Rebuild and restart
rebuild:
	@echo "🔨 Rebuilding and restarting services..."
	@docker compose down
	@echo ""
	@echo "Building containers (no cache)..."
	@docker compose build --no-cache
	@echo ""
	@echo "Starting services..."
	@$(MAKE) ensure-volumes
	@docker compose up -d
	@echo ""
	@echo "✅ Services rebuilt and started!"
	@echo ""
	@echo "🤖 Pulling Ollama models (this may take a few minutes)..."
	@sleep 5
	@$(MAKE) ollama-models || echo "⚠️  Warning: Ollama models pull failed. You can manually pull them with 'make ollama-models'"
	@echo ""
	@echo "🌐 Access LibreChat at: http://localhost:3080"
	@echo "📊 Access MCP ClickHouse at: http://localhost:8001"

# Pull all Ollama models
ollama-models:
	@echo "📦 Checking Ollama models..."
	@echo ""
	@echo "Waiting for Ollama service to be ready..."
	@timeout=60; while ! docker compose exec ollama ollama list >/dev/null 2>&1 && [ $$timeout -gt 0 ]; do \
		echo "Waiting for Ollama... ($$timeout seconds remaining)"; \
		sleep 2; \
		timeout=$$((timeout-2)); \
	done
	@if ! docker compose exec ollama ollama list >/dev/null 2>&1; then \
		echo "❌ Error: Ollama service is not ready"; \
		exit 1; \
	fi
	@echo ""
	@echo "1/2 Checking Qwen model..."
	@if docker compose exec ollama ollama list | grep -q "qwen"; then \
		echo "✅ Qwen model already exists (skipping download)"; \
	else \
		echo "📥 Pulling Qwen model (this may take several minutes)..."; \
		docker compose exec ollama ollama pull qwen:latest && echo "✅ Qwen model pulled successfully" || echo "❌ Failed to pull Qwen model"; \
	fi
	@echo ""
	@echo "2/2 Checking Llama 3.2 model..."
	@if docker compose exec ollama ollama list | grep -q "llama3.2"; then \
		echo "✅ Llama 3.2 model already exists (skipping download)"; \
	else \
		echo "📥 Pulling Llama 3.2 model (this may take several minutes)..."; \
		docker compose exec ollama ollama pull llama3.2:latest && echo "✅ Llama 3.2 model pulled successfully" || echo "❌ Failed to pull Llama 3.2 model"; \
	fi
	@echo ""
	@echo "✅ Ollama models ready!"
	@echo ""
	@echo "📋 Installed models:"
	@docker compose exec ollama ollama list
	@echo ""
	@echo "Test models with:"
	@echo "  make ollama-test-qwen"
	@echo "  make ollama-test-llama"

# Pull individual models
ollama-pull-qwen:
	@echo "Checking Qwen model..."
	@if docker compose exec ollama ollama list | grep -q "qwen"; then \
		echo "✅ Qwen model already exists"; \
		echo "💡 To update, run: docker compose exec ollama ollama pull qwen:latest"; \
	else \
		echo "📥 Pulling Qwen model..."; \
		docker compose exec ollama ollama pull qwen:latest; \
		echo "✅ Qwen model ready"; \
	fi

ollama-pull-llama:
	@echo "Checking Llama 3.2 model..."
	@if docker compose exec ollama ollama list | grep -q "llama3.2"; then \
		echo "✅ Llama 3.2 model already exists"; \
		echo "💡 To update, run: docker compose exec ollama ollama pull llama3.2:latest"; \
	else \
		echo "📥 Pulling Llama 3.2 model..."; \
		docker compose exec ollama ollama pull llama3.2:latest; \
		echo "✅ Llama 3.2 model ready"; \
	fi

# List Ollama models
ollama-list:
	@echo "Installed Ollama models:"
	@docker compose exec ollama ollama list

# Test Ollama models
ollama-test-qwen:
	@echo "Testing Qwen model..."
	@docker compose exec ollama ollama run qwen:latest "Hello, introduce yourself briefly"

ollama-test-llama:
	@echo "Testing Llama 3.2 model..."
	@docker compose exec ollama ollama run llama3.2:latest "Hello, introduce yourself briefly"

# View all logs
logs:
	docker compose logs -f

# View API logs
logs-api:
	docker compose logs -f api

# View MongoDB logs
logs-db:
	docker compose logs -f mongodb

# View Ollama logs
logs-ollama:
	docker compose logs -f ollama

# LDAP helpers
LDAP_USER_OPTIONAL_ARGS := $(if $(FIRSTNAME),--firstname "$(FIRSTNAME)") $(if $(LASTNAME),--lastname "$(LASTNAME)") $(if $(EMAIL),--email "$(EMAIL)") $(if $(PASSWORD),--password "$(PASSWORD)") $(if $(GROUPS),--groups "$(GROUPS)") $(if $(ORG),--org "$(ORG)")
ldap-up:
	@echo "Starting LDAP container only..."
	docker compose up -d ldap
	@echo "✅ ldap service is starting"

ldap-down:
	@echo "Stopping LDAP container..."
	docker compose stop ldap
	@echo "✅ ldap stopped"

ldap-test:
	@echo "Testing LDAP connectivity..."
	docker compose exec ldap ldapsearch -x -LLL -D "cn=admin,dc=librechat,dc=local" -w admin -b "dc=librechat,dc=local" "(objectclass=*)" dn | head
	@echo "✅ LDAP search returned results"

ldap-integration-test:
	@echo "Validating LDAP + Keycloak integration..."
	@echo "Seeding LDAP user (if missing)..."
	@bash scripts/add-ldap-user.sh seed || true
	@docker compose exec ldap ldapsearch -x -LLL -D "cn=admin,dc=librechat,dc=local" -w admin -b "ou=users,dc=librechat,dc=local" "(cn=ssouser)" dn >/dev/null 2>&1 \
		&& echo "✅ LDAP has ssouser entry" || (echo "❌ ssouser missing in LDAP" && exit 1)
	@if curl -s http://localhost:8080/health >/dev/null 2>&1; then \
		echo "✅ Keycloak is responding"; \
	else \
		echo "❌ Keycloak did not respond"; \
		exit 1; \
	fi

keycloak-up:
	@echo "Starting Keycloak and Postgres..."
	docker compose up -d keycloak-db keycloak
	@echo "✅ Keycloak services are starting"

keycloak-down:
	@echo "Stopping Keycloak services..."
	docker compose stop keycloak keycloak-db
	@echo "✅ Keycloak services stopped"

keycloak-test:
	@echo "Checking Keycloak admin console..."
	@timeout=30; while ! curl -s http://localhost:8080/health >/dev/null 2>&1 && [ $$timeout -gt 0 ]; do \
		echo "Waiting for Keycloak... ($$timeout seconds remaining)"; \
		sleep 2; \
		timeout=$$((timeout-2)); \
	done
	@if curl -s http://localhost:8080/health >/dev/null 2>&1; then \
		echo "✅ Keycloak is responding"; \
	else \
		echo "❌ Keycloak did not respond yet"; \
		exit 1; \
	fi

add-ldap-user:
	@if [ -z "$(USERNAME)" ]; then \
		echo "Seeding ssouser into OpenLDAP (idempotent)..."; \
		bash scripts/add-ldap-user.sh seed; \
	else \
		echo "Creating/updating LDAP user '$(USERNAME)'..."; \
		bash scripts/add-ldap-user.sh user \
			--username "$(USERNAME)" $(LDAP_USER_OPTIONAL_ARGS); \
	fi
	@echo "Run scripts/add-ldap-user.sh help for advanced user/group commands"

list-users:
	@echo "Listing LDAP users..."
	@bash scripts/add-ldap-user.sh list

list-services:
	@services=$$(docker compose config --services 2>/dev/null || true); \
	states=$$(docker compose ps --format '{{.Service}}\t{{.State}}' 2>/dev/null || true); \
	echo "Docker Compose service statuses:"; \
	if [ -z "$$services" ] && [ -z "$$states" ]; then \
		echo "⚠️  Unable to inspect docker compose services."; \
	fi; \
	if [ -z "$$services" ]; then \
		services=$$(printf '%s\n' "$$states" | awk -F'\t' '!seen[$$1]++ {print $$1}'); \
	fi; \
	printf '%-30s %s\n' "SERVICE" "STATUS"; \
	printf '%-30s %s\n' "-------" "------"; \
	for svc in $$services; do \
		status=$$(printf '%s\n' "$$states" | awk -v service="$$svc" 'BEGIN {st="not created"} $$1==service {st=$$2; for (i=3;i<=NF;i++) st=st" " $$i} END {print st}'); \
		if [ -z "$$status" ]; then status="not created"; fi; \
		printf '%-30s %s\n' "$$svc" "$$status"; \
	done

# Show running containers
ps:
	@echo "Running containers:"
	@docker compose ps
	@echo ""
	@echo "Resource usage:"
	@docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Open shell in API container
shell:
	docker compose exec api sh

# Open shell in Ollama container
shell-ollama:
	docker compose exec ollama bash

# Health check
health:
	@echo "🏥 Checking service health..."
	@echo ""
	@echo "Container Status:"
	@docker compose ps
	@echo ""
	@echo "LibreChat API:"
	@curl -s http://localhost:3080/api/health 2>/dev/null && echo "✅ API is healthy" || echo "❌ API is not responding"
	@echo ""
	@echo "MCP ClickHouse:"
	@curl -s http://localhost:8001 2>/dev/null && echo "✅ MCP is responding" || echo "❌ MCP is not responding"
	@echo ""
	@echo "Ollama:"
	@docker compose exec ollama ollama list 2>/dev/null && echo "✅ Ollama is ready" || echo "❌ Ollama is not ready"

# Development mode
dev:
	@echo "Starting in development mode..."
	docker compose -f docker-compose.yml -f docker-compose.override.yml up

# Start MCP ClickHouse server
mcp-start:
	@echo "Starting MCP ClickHouse server..."
	docker compose up -d mcp-clickhouse
	@echo "MCP ClickHouse server started on port 8001"
	@echo "Access at: http://localhost:8001"

# Stop MCP ClickHouse server
mcp-stop:
	@echo "Stopping MCP ClickHouse server..."
	docker compose stop mcp-clickhouse

# View MCP ClickHouse logs
mcp-logs:
	docker compose logs -f mcp-clickhouse

# Restart MCP ClickHouse server
mcp-restart: mcp-stop mcp-start

# Clean everything
clean:
	@echo "🧹 Cleaning up containers, volumes, and images..."
	@echo ""
	@read -p "⚠️  This will remove all containers, volumes, and data. Are you sure? [y/N] " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		echo "Stopping and removing containers..."; \
		docker compose down -v; \
		echo "Pruning Docker system..."; \
		docker system prune -af --volumes; \
		echo "✅ Cleanup complete!"; \
	else \
		echo "❌ Cleanup cancelled."; \
	fi

# Run the auth guardrail validation script inside Node Docker so Node stays inside containers and results persist on the host via reports/
auth-guardrails-test:
	@echo "Running auth guardrail validation inside docker node image..."
	docker run --rm -v "$(ROOT_DIR)":/workspace -w /workspace node:20 node scripts/tests/auth-guardrails.js --template scripts/templates/org-template.json --report reports/auth-guardrails.txt

# Reset database
reset:
	@echo "🔄 Resetting database..."
	@docker compose stop mongodb
	@docker volume rm librechat_data-node 2>/dev/null || echo "Volume already removed or doesn't exist"
	@docker compose up -d mongodb
	@echo ""
	@echo "Waiting for MongoDB to be ready..."
	@sleep 5
	@docker compose restart api
	@echo ""
	@echo "✅ Database reset complete!"
	@echo "💡 Tip: Create a new account at http://localhost:3080"
