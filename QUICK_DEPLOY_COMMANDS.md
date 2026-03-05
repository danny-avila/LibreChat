# Quick Deploy Commands for Production

## SSH into Your Server First
```bash
ssh your-server
cd /path/to/librechat-repo/postiz-deployment
```

## Deploy Postiz (Choose One Method)

### Method 1: Using Deploy Script (Recommended)
```bash
chmod +x deploy.sh
./deploy.sh
```

### Method 2: Manual Commands
```bash
# Pull the image first (this fixes the "No such image" error)
docker pull ghcr.io/gitroomhq/postiz-app:latest

# Stop and start services
docker compose down
docker compose up -d
```

### Method 3: Quick Restart (if already deployed)
```bash
chmod +x quick-fix.sh
./quick-fix.sh
```

## Check Status
```bash
# View all services
docker compose ps

# View Postiz logs
docker compose logs -f postiz

# View all logs
docker compose logs -f
```

## Verify Deployment
```bash
# Check if Postiz is responding
curl https://postiz.cloud.jamot.pro

# Check container health
docker compose ps postiz
```

## Monitor Stability
```bash
chmod +x monitor.sh
./monitor.sh
```

## If Something Goes Wrong
```bash
# Capture diagnostics
chmod +x diagnose.sh
./diagnose.sh

# Quick restart
./quick-fix.sh

# Full restart
docker compose down
docker compose up -d
```

## After Successful Deployment

1. **Add Twitter Callback URLs** (see TWITTER_CALLBACK_URLS.txt)
2. **Visit Postiz**: https://postiz.cloud.jamot.pro
3. **Connect Accounts**: Settings → Integrations
4. **Test Flow**: Create draft → Approve → Post

## Important Notes

- The deployment script pulls all images first to avoid "No such image" errors
- Twitter credentials are already configured in `.env`
- LinkedIn credentials are already configured in `.env`
- Postiz API key is already updated in LibreChat `.env`
- All scripts have resource limits and log rotation for stability
