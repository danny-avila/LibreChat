.PHONY: help setup install build up down restart logs clean rebuild

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
	@echo "  make up             - Start all services"
	@echo "  make down           - Stop all services"
	@echo "  make restart        - Restart all services"
	@echo "  make rebuild        - Rebuild and restart services"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make logs           - View container logs (all services)"
	@echo "  make logs-api       - View API container logs"
	@echo "  make logs-db        - View MongoDB container logs"
	@echo "  make clean          - Remove containers, volumes, and images"
	@echo "  make shell          - Open shell in API container"
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
		echo "Creating docker-compose.override.yml..."; \
		echo "# Bintybyte LibreChat - Docker Compose Override" > docker-compose.override.yml; \
		echo "# Enables: Groq, Mistral, OpenRouter, Helicone, Portkey, MCP, WebSearch" >> docker-compose.override.yml; \
		echo "" >> docker-compose.override.yml; \
		echo "services:" >> docker-compose.override.yml; \
		echo "  api:" >> docker-compose.override.yml; \
		echo "    volumes:" >> docker-compose.override.yml; \
		echo "      - ./librechat.yaml:/app/librechat.yaml" >> docker-compose.override.yml; \
		echo "" >> docker-compose.override.yml; \
		echo "  mcp-clickhouse:" >> docker-compose.override.yml; \
		echo "    image: mcp/clickhouse" >> docker-compose.override.yml; \
		echo "    container_name: mcp-clickhouse" >> docker-compose.override.yml; \
		echo "    ports:" >> docker-compose.override.yml; \
		echo "      - 8001:8000" >> docker-compose.override.yml; \
		echo "    extra_hosts:" >> docker-compose.override.yml; \
		echo "      - \"host.docker.internal:host-gateway\"" >> docker-compose.override.yml; \
		echo "    environment:" >> docker-compose.override.yml; \
		echo "      - CLICKHOUSE_HOST=sql-clickhouse.clickhouse.com" >> docker-compose.override.yml; \
		echo "      - CLICKHOUSE_USER=demo" >> docker-compose.override.yml; \
		echo "      - CLICKHOUSE_PASSWORD=" >> docker-compose.override.yml; \
		echo "      - CLICKHOUSE_MCP_SERVER_TRANSPORT=sse" >> docker-compose.override.yml; \
		echo "      - CLICKHOUSE_MCP_BIND_HOST=0.0.0.0" >> docker-compose.override.yml; \
		echo "docker-compose.override.yml created with MCP ClickHouse service."; \
	else \
		echo "docker-compose.override.yml already exists. Skipping..."; \
	fi
	@if [ ! -f librechat.yaml ]; then \
		echo "Creating librechat.yaml with MCP and WebSearch enabled..."; \
		cp librechat.example.yaml librechat.yaml; \
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
	npm install
	cd api && npm install
	cd client && npm install

# Build Docker containers
build:
	@echo "Building Docker containers..."
	docker compose build

# Start services
up:
	@echo "Starting Bintybyte LibreChat services..."
	docker compose up -d
	@echo ""
	@echo "Services are starting..."
	@echo "Access LibreChat at: http://localhost:3080"

# Stop services
down:
	@echo "Stopping services..."
	docker compose down

# Restart services
restart: down up

# Rebuild and restart
rebuild:
	@echo "Rebuilding and restarting services..."
	docker compose down
	docker compose build --no-cache
	docker compose up -d
	@echo "Services rebuilt and started!"

# View all logs
logs:
	docker compose logs -f

# View API logs
logs-api:
	docker compose logs -f api

# View MongoDB logs
logs-db:
	docker compose logs -f mongodb

# Show running containers
ps:
	docker compose ps

# Open shell in API container
shell:
	docker compose exec api sh

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
	@echo "Cleaning up containers, volumes, and images..."
	@read -p "This will remove all containers, volumes, and data. Are you sure? [y/N] " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		docker compose down -v; \
		docker system prune -af --volumes; \
		echo "Cleanup complete!"; \
	else \
		echo "Cleanup cancelled."; \
	fi

# Reset database
reset:
	@echo "Resetting database..."
	docker compose down mongodb
	docker volume rm librechat_data-node || true
	docker compose up -d mongodb
	@echo "Database reset complete!"
	@echo "Restarting services..."
	docker compose restart api
