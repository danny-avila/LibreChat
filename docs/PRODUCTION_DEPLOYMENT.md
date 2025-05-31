# LibreChat Production Deployment Guide

## Overview

This guide covers the complete production deployment of LibreChat using the optimized multi-stage Docker solution with comprehensive monitoring and management capabilities.

## Architecture

The production deployment includes:

- **Multi-stage Docker Build**: Optimized production image (1.12GB)
- **NGINX Reverse Proxy**: SSL termination, rate limiting, security headers
- **MongoDB**: Persistent database with security and performance optimization
- **Meilisearch**: Full-text search with persistence
- **PostgreSQL + pgvector**: Vector database for RAG functionality
- **Monitoring Stack**: Prometheus, Grafana, Loki, Promtail
- **Health Checks**: Comprehensive service monitoring
- **Backup/Restore**: Automated data protection

## Quick Start

### 1. Prerequisites

- Docker Engine 20.10+
- Docker Compose v2.0+
- At least 4GB RAM available
- 20GB disk space

### 2. Initial Setup

```bash
# Clone and navigate to the project
cd /path/to/librechat

# Copy environment template
cp .env.production.template .env.production

# Edit with your production values
nano .env.production
```

### 3. Deploy to Production

```bash
# Run the deployment script
./scripts/deploy-production.sh
```

This script will:
- Check prerequisites
- Validate environment configuration
- Create automatic backup
- Build optimized multi-stage Docker image
- Deploy all services with monitoring
- Run health checks
- Display deployment status

### 4. Access Your Deployment

- **LibreChat Application**: http://localhost:80
- **Grafana Monitoring**: http://localhost:3000
- **Prometheus Metrics**: http://localhost:9090

## Production Management

Use the management script for day-to-day operations:

```bash
# Show deployment status
./scripts/manage-production.sh status

# View logs
./scripts/manage-production.sh logs api

# Restart services
./scripts/manage-production.sh restart

# Update deployment
./scripts/manage-production.sh update

# Create backup
./scripts/manage-production.sh backup

# Scale API service
./scripts/manage-production.sh scale api 2

# Run health checks
./scripts/manage-production.sh health
```

## Configuration Details

### Environment Variables

Critical environment variables in `.env.production`:

```bash
# Security (REQUIRED - Generate strong random values)
MONGODB_PASSWORD=your-secure-mongodb-password
POSTGRES_PASSWORD=your-secure-postgres-password
JWT_SECRET=your-jwt-secret-minimum-32-chars
JWT_REFRESH_SECRET=your-jwt-refresh-secret-minimum-32-chars
CREDS_KEY=your-creds-encryption-key-32-chars
CREDS_IV=your-16-byte-hex-iv

# Services
MEILI_MASTER_KEY=your-meilisearch-master-key
GRAFANA_PASSWORD=your-grafana-password

# AI Providers
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### SSL Configuration

1. Obtain SSL certificates (Let's Encrypt recommended):
```bash
# Using certbot
certbot certonly --webroot -w /var/www/certbot -d your-domain.com
```

2. Copy certificates to nginx/ssl/:
```bash
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem nginx/ssl/
```

3. Update domain in `nginx/conf.d/librechat.conf`

### Resource Limits

Default resource limits per service:
- **API**: 2GB RAM, 1 CPU
- **MongoDB**: 1GB RAM, 0.5 CPU
- **PostgreSQL**: 1GB RAM, 0.5 CPU
- **Meilisearch**: 512MB RAM, 0.25 CPU
- **RAG API**: 512MB RAM, 0.25 CPU

## Monitoring and Observability

### Grafana Dashboards

Access Grafana at http://localhost:3000 with configured credentials.

Default dashboards include:
- System overview
- Application metrics
- Database performance
- Request/response metrics
- Error tracking

### Log Aggregation

Logs are centrally collected via Loki:
- Application logs from `/logs` directory
- Docker container logs
- NGINX access/error logs

### Alerts

Configure alerts in Grafana for:
- High memory usage
- API response time
- Database connectivity
- Disk space usage

## Backup and Disaster Recovery

### Automated Backups

The deployment includes automated backup functionality:

```bash
# Create backup
./scripts/manage-production.sh backup

# Restore from backup
./scripts/manage-production.sh restore /path/to/backup.tar.gz
```

Backups include:
- All Docker volumes (databases, configurations)
- Configuration files
- Environment settings

### Backup Strategy

Recommended backup schedule:
- **Daily**: Automated volume backups
- **Weekly**: Full configuration backup
- **Monthly**: Archive to external storage

## Security Considerations

### Network Security
- All services run on isolated Docker network
- Only necessary ports exposed to host
- NGINX handles SSL termination
- Rate limiting on API endpoints

### Database Security
- MongoDB with authentication enabled
- PostgreSQL with user authentication
- Encrypted data at rest (when supported)
- Regular security updates

### Application Security
- JWT-based authentication
- Encrypted credentials storage
- CORS protection
- Security headers via NGINX

## Performance Optimization

### Database Optimization
- MongoDB indexes for common queries
- Connection pooling
- Query optimization
- Regular maintenance tasks

### Caching
- NGINX static file caching
- Application-level caching
- Browser cache headers

### Resource Monitoring
- Prometheus metrics collection
- Grafana visualization
- Alert on resource thresholds

## Troubleshooting

### Common Issues

1. **Services won't start**
   ```bash
   # Check logs
   ./scripts/manage-production.sh logs
   
   # Check resource usage
   docker stats
   ```

2. **Database connection errors**
   ```bash
   # Check MongoDB health
   docker exec LibreChat-MongoDB-Production mongosh --eval "db.adminCommand('ping')"
   ```

3. **High memory usage**
   ```bash
   # Check resource limits
   ./scripts/manage-production.sh status
   
   # Scale down if needed
   ./scripts/manage-production.sh scale api 1
   ```

### Health Checks

Built-in health checks monitor:
- API endpoint availability
- Database connectivity
- Service container status
- Resource usage thresholds

### Log Analysis

Check specific service logs:
```bash
# API logs
./scripts/manage-production.sh logs api

# Database logs
./scripts/manage-production.sh logs mongodb

# NGINX logs
./scripts/manage-production.sh logs nginx
```

## Scaling

### Horizontal Scaling

Scale individual services:
```bash
# Scale API to 3 instances
./scripts/manage-production.sh scale api 3

# Scale RAG API
./scripts/manage-production.sh scale rag_api 2
```

### Vertical Scaling

Modify resource limits in `docker-compose.production.yml`:
```yaml
deploy:
  resources:
    limits:
      memory: 4G
      cpus: '2.0'
```

## Updates and Maintenance

### Application Updates

```bash
# Update to latest version
./scripts/manage-production.sh update
```

This performs:
- Automatic backup
- New image build
- Rolling update
- Health verification

### System Maintenance

Regular maintenance tasks:
```bash
# Clean up unused resources
./scripts/manage-production.sh cleanup

# Check system health
./scripts/manage-production.sh health

# Monitor resource usage
docker stats
```

## Support and Documentation

### Additional Resources
- [LibreChat Documentation](https://docs.librechat.ai/)
- [Docker Best Practices](https://docs.docker.com/develop/best-practices/)
- [NGINX Configuration](https://nginx.org/en/docs/)

### Getting Help
- Check application logs first
- Review health check results
- Monitor resource usage
- Consult monitoring dashboards

---

**Note**: This production deployment is designed for robust, scalable operation. Always test changes in a staging environment before applying to production.
