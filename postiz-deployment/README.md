# Postiz Deployment for LibreChat Integration

This directory contains the Docker Compose configuration for self-hosting Postiz as part of the LibreChat social media automation integration.

## Quick Start

1. **Start Postiz:**
   ```bash
   docker compose up -d
   ```

2. **Check status:**
   ```bash
   docker compose ps
   ```

3. **View logs:**
   ```bash
   docker compose logs -f postiz
   ```

4. **Access Postiz:**
   - Open browser: http://localhost:3000
   - Create admin account
   - Configure social platform integrations

5. **Stop Postiz:**
   ```bash
   docker compose down
   ```

## Files

- `docker-compose.yml` - Docker services configuration
- `.env` - Environment variables (DO NOT COMMIT)
- `.env.example` - Example environment variables
- `README.md` - This file

## Services

- **postiz** - Main application (port 3000)
- **postgres** - PostgreSQL database (port 5432)
- **redis** - Redis cache (port 6379)

## Data Persistence

Data is stored in Docker volumes:
- `postgres_data` - Database data
- `redis_data` - Cache data
- `postiz_uploads` - Uploaded files
- `postiz_logs` - Application logs

## For detailed setup instructions, see:
`../POSTIZ_DEPLOYMENT_GUIDE.md`
