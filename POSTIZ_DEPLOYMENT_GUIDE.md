# Postiz Self-Hosted Deployment Guide

## Overview
This guide will help you deploy Postiz locally using Docker Compose for the LibreChat social media integration.

**Configuration:**
- Deployment: Self-hosted (Docker)
- Posting: Immediate only (v1)
- Media: Text-only (v1)
- Database: PostgreSQL
- Cache: Redis

---

## Prerequisites

Before starting, ensure you have:
- [ ] Docker installed (version 20.10+)
- [ ] Docker Compose installed (version 2.0+)
- [ ] At least 2GB free RAM
- [ ] At least 5GB free disk space
- [ ] Port 3000 available (or choose another port)

### Check Prerequisites

```bash
# Check Docker
docker --version

# Check Docker Compose
docker compose version

# Check available ports
netstat -an | findstr :3000
```

---

## Step 1: Create Postiz Directory

Create a dedicated directory for Postiz:

```bash
# Create directory
mkdir postiz-deployment
cd postiz-deployment
```

---

## Step 2: Create Docker Compose File

Create `docker-compose.yml` in the `postiz-deployment` directory with the configuration provided in this repo.

See: `postiz-deployment/docker-compose.yml`

---

## Step 3: Create Environment File

Create `.env` file in the `postiz-deployment` directory with the configuration provided.

See: `postiz-deployment/.env`

---

## Step 4: Deploy Postiz

```bash
# Navigate to postiz-deployment directory
cd postiz-deployment

# Start Postiz services
docker compose up -d

# Check if containers are running
docker compose ps

# View logs
docker compose logs -f postiz
```

**Expected Output:**
```
✔ Container postiz-postgres  Started
✔ Container postiz-redis     Started
✔ Container postiz           Started
```

---

## Step 5: Access Postiz

1. Open browser and navigate to: `http://localhost:3000`
2. You should see the Postiz login/setup page
3. Create your admin account:
   - Email: `admin@yourdomain.com`
   - Password: (choose a strong password)
   - Organization name: Your company name

---

## Step 6: Configure Social Platform Integrations

### LinkedIn Setup

1. Go to Postiz Settings → Integrations
2. Click "Add Integration" → LinkedIn
3. You'll need LinkedIn OAuth credentials:
   - Go to: https://www.linkedin.com/developers/apps
   - Create a new app
   - Add OAuth 2.0 redirect URL: `http://localhost:3000/api/auth/linkedin/callback`
   - Copy Client ID and Client Secret
   - Paste into Postiz

### X (Twitter) Setup

1. In Postiz Settings → Integrations
2. Click "Add Integration" → X (Twitter)
3. You'll need X API credentials:
   - Go to: https://developer.twitter.com/en/portal/dashboard
   - Create a new app (or use existing)
   - Enable OAuth 2.0
   - Add callback URL: `http://localhost:3000/api/auth/twitter/callback`
   - Copy API Key, API Secret, Bearer Token
   - Paste into Postiz

### Instagram Setup

1. In Postiz Settings → Integrations
2. Click "Add Integration" → Instagram
3. You'll need Facebook/Instagram credentials:
   - Go to: https://developers.facebook.com/apps
   - Create a new app
   - Add Instagram Basic Display
   - Add redirect URL: `http://localhost:3000/api/auth/instagram/callback`
   - Copy App ID and App Secret
   - Paste into Postiz

**Note:** For production, you'll need to submit apps for review on each platform.

---

## Step 7: Generate API Key for LibreChat

1. In Postiz, go to Settings → API Keys
2. Click "Generate New API Key"
3. Name it: "LibreChat Integration"
4. Copy the API key (you'll need this for LibreChat configuration)
5. Save it securely

**Example API Key format:**
```
postiz_live_1234567890abcdefghijklmnopqrstuvwxyz
```

---

## Step 8: Test Postiz

### Manual Test (via UI)

1. Connect a test social account (e.g., your personal LinkedIn)
2. Create a test post in Postiz UI
3. Verify it posts successfully to the platform
4. Check the post appears on your social media

### API Test (via curl)

```bash
# Test API connectivity
curl -X GET http://localhost:3000/api/health

# Test authentication (replace with your API key)
curl -X GET http://localhost:3000/api/integrations \
  -H "Authorization: Bearer YOUR_API_KEY_HERE"
```

**Expected Response:**
```json
{
  "integrations": [
    {
      "id": "int_123abc",
      "platform": "linkedin",
      "accountName": "Your Name",
      "isActive": true
    }
  ]
}
```

---

## Step 9: Update LibreChat Configuration

Add Postiz configuration to your LibreChat `.env` file:

```bash
# Postiz Configuration
POSTIZ_API_URL=http://localhost:3000/api
POSTIZ_API_KEY=your_api_key_from_step_7
POSTIZ_WEBHOOK_SECRET=generate_random_string_here
```

To generate webhook secret:
```bash
# Windows PowerShell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

---

## Step 10: Verify Deployment

Checklist:
- [ ] Postiz UI accessible at http://localhost:3000
- [ ] Admin account created
- [ ] At least one social platform connected (for testing)
- [ ] API key generated
- [ ] API test successful
- [ ] LibreChat .env updated with Postiz credentials

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker compose logs postiz

# Check if ports are in use
netstat -an | findstr :3000

# Restart containers
docker compose restart
```

### Database connection errors

```bash
# Check PostgreSQL container
docker compose logs postgres

# Restart database
docker compose restart postgres

# Wait 10 seconds, then restart Postiz
docker compose restart postiz
```

### Can't access Postiz UI

1. Check if container is running: `docker compose ps`
2. Check firewall settings
3. Try accessing via IP: `http://127.0.0.1:3000`
4. Check logs: `docker compose logs -f postiz`

### Social platform connection fails

1. Verify OAuth credentials are correct
2. Check redirect URLs match exactly
3. Ensure app is in development mode (for testing)
4. Check platform API status pages

---

## Maintenance Commands

```bash
# View logs
docker compose logs -f postiz

# Restart Postiz
docker compose restart postiz

# Stop Postiz
docker compose stop

# Start Postiz
docker compose start

# Update Postiz (when new version available)
docker compose pull
docker compose up -d

# Backup database
docker compose exec postgres pg_dump -U postiz postiz > backup.sql

# Restore database
docker compose exec -T postgres psql -U postiz postiz < backup.sql
```

---

## Security Considerations

### For Production Deployment

1. **Use HTTPS**: Set up SSL certificate (Let's Encrypt)
2. **Change default passwords**: Update all passwords in `.env`
3. **Restrict access**: Use firewall rules
4. **Regular backups**: Automate database backups
5. **Update regularly**: Keep Postiz and dependencies updated
6. **Monitor logs**: Set up log monitoring
7. **Use secrets management**: Don't commit `.env` to git

### Recommended Changes for Production

```env
# Use strong passwords
POSTGRES_PASSWORD=<generate-strong-password>
REDIS_PASSWORD=<generate-strong-password>

# Use production domain
POSTIZ_URL=https://postiz.yourdomain.com

# Enable security features
POSTIZ_SECURE_COOKIES=true
POSTIZ_RATE_LIMIT_ENABLED=true
```

---

## Next Steps

After successful deployment:

1. ✅ Postiz is running
2. ✅ API key generated
3. ✅ LibreChat .env updated
4. → **Next: Phase D2** - Implement user account connection flow in LibreChat
5. → **Next: Phase D3** - Update n8n workflow to use Postiz API

---

## Support Resources

- **Postiz Documentation**: https://docs.postiz.com
- **Postiz GitHub**: https://github.com/gitroomhq/postiz-app
- **Docker Documentation**: https://docs.docker.com
- **LibreChat Integration**: See `POSTIZ_INTEGRATION_PLAN.md`

---

*Created: 2026-02-19*
*Phase: D1 - Postiz Setup & Configuration*
*Status: Ready for deployment*
