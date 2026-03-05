# Postiz Deployment Guide

## Quick Deploy

### Option 1: Using Deployment Script (Recommended)
```bash
cd postiz-deployment
chmod +x deploy.sh
./deploy.sh
```

### Option 2: Manual Deployment
```bash
cd postiz-deployment

# Pull images first
docker pull ghcr.io/gitroomhq/postiz-app:latest

# Deploy
docker compose down
docker compose up -d
```

## Troubleshooting

### "No such image" Error
If you get "No such image: ghcr.io/gitroomhq/postiz-app:latest", run:
```bash
docker pull ghcr.io/gitroomhq/postiz-app:latest
docker compose up -d
```

### Check Service Status
```bash
docker compose ps
docker compose logs -f postiz
```

### Restart Services
```bash
docker compose restart postiz
```

### Full Restart
```bash
docker compose down
docker compose up -d
```

## Monitoring

Use the monitoring scripts:
```bash
./monitor.sh      # Health check and auto-restart
./diagnose.sh     # Capture diagnostics
./quick-fix.sh    # Quick restart
```

## Next Steps After Deployment

1. **Verify Postiz is running**: Visit https://postiz.cloud.jamot.pro
2. **Connect Twitter/X account**:
   - Add callback URLs to Twitter Developer Portal (see TWITTER_CALLBACK_URLS.txt)
   - Go to Postiz → Settings → Integrations → Connect X/Twitter
3. **Connect LinkedIn account**:
   - Go to Postiz → Settings → Integrations → Connect LinkedIn
4. **Test the flow**:
   - Create a draft in LibreChat
   - Approve it (PostComposer opens)
   - Edit and post via Postiz
   - Verify on social media

## Configuration Files

- `.env` - Environment variables (credentials, URLs)
- `docker-compose.yml` - Service definitions
- `deploy.sh` - Automated deployment script
- `monitor.sh` - Health monitoring
- `diagnose.sh` - Diagnostics capture
- `quick-fix.sh` - Quick restart
