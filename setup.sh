#!/bin/bash
set -e

echo "========================================="
echo "  LibreChat Setup Script"
echo "========================================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "[1/5] Creating .env from template..."
    cp .env.template .env

    # Generate secrets
    JWT_SECRET=$(openssl rand -hex 32)
    JWT_REFRESH_SECRET=$(openssl rand -hex 32)
    CREDS_KEY=$(openssl rand -hex 32)
    CREDS_IV=$(openssl rand -hex 16)
    MEILI_KEY=$(openssl rand -hex 32)

    # Replace placeholders
    sed -i "s/GENERATE_JWT_SECRET/$JWT_SECRET/" .env
    sed -i "s/GENERATE_JWT_REFRESH_SECRET/$JWT_REFRESH_SECRET/" .env
    sed -i "s/GENERATE_CREDS_KEY/$CREDS_KEY/" .env
    sed -i "s/GENERATE_CREDS_IV/$CREDS_IV/" .env
    sed -i "s/GENERATE_MEILI_KEY/$MEILI_KEY/" .env

    echo "  -> Secrets generated!"
    echo ""
    echo "  IMPORTANT: Edit .env now to configure:"
    echo "    - DOMAIN_CLIENT and DOMAIN_SERVER (your domain)"
    echo "    - API keys for Qwen, DeepSeek, Anthropic, Zhipu AI"
    echo "    - SMTP settings (optional)"
    echo ""
    echo "  Run: nano .env"
    echo ""
    read -p "  Press ENTER when ready to continue..."
else
    echo "[1/5] .env already exists, skipping..."
fi

# Check if librechat.yaml exists
if [ ! -f librechat.yaml ]; then
    echo "[2/5] Creating librechat.yaml from template..."
    cp librechat.template.yaml librechat.yaml
    echo "  -> Done! Edit librechat.yaml if you need to customize endpoints."
else
    echo "[2/5] librechat.yaml already exists, skipping..."
fi

# Create necessary directories
echo "[3/5] Creating directories..."
mkdir -p data-node meili_data uploads logs images skill
echo "  -> Done!"

# Build and start containers
echo "[4/5] Building and starting containers..."
docker compose -f docker-compose.server.yml up -d --build
echo "  -> Containers started!"

# Wait for Ollama to be ready
echo "[5/5] Waiting for Ollama to be ready..."
sleep 10

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "LibreChat is running at: http://localhost:3080"
echo ""
echo "Next steps:"
echo "  1. Create the first admin user:"
echo "     docker compose -f docker-compose.server.yml exec api npm run create-user"
echo ""
echo "  2. Pull Ollama models (optional):"
echo "     docker exec -it ollama ollama pull llama3.2"
echo "     docker exec -it ollama ollama pull qwen2.5"
echo "     docker exec -it ollama ollama pull deepseek-r1"
echo ""
echo "  3. Configure Apache2 reverse proxy (see docs/apache2.conf.example)"
echo ""
echo "  4. Enable Cloudflare Turnstile (edit librechat.yaml)"
echo ""
