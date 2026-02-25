# Phase D1: Postiz Setup & Configuration - Checklist

**Status:** 🔄 IN PROGRESS  
**Started:** 2026-02-19

---

## Pre-Deployment Checklist

### Prerequisites
- [ ] Docker installed and running
- [ ] Docker Compose installed (v2.0+)
- [ ] At least 2GB free RAM
- [ ] At least 5GB free disk space
- [ ] Port 3000 available (or choose another)

**Verification Commands:**
```bash
docker --version
docker compose version
netstat -an | findstr :3000
```

---

## Deployment Steps

### Step 1: Deploy Postiz
- [ ] Navigate to `postiz-deployment` directory
- [ ] Review `.env` file (already created with dev defaults)
- [ ] Run deployment: `docker compose up -d`
- [ ] Verify containers are running: `docker compose ps`
- [ ] Check logs: `docker compose logs -f postiz`

**Expected:** 3 containers running (postiz, postgres, redis)

### Step 2: Initial Setup
- [ ] Access Postiz UI at http://localhost:3000
- [ ] Create admin account
  - Email: ___________________________
  - Password: (saved securely)
  - Organization: ___________________________
- [ ] Verify login works

### Step 3: Configure Social Platforms

#### LinkedIn Integration
- [ ] Go to https://www.linkedin.com/developers/apps
- [ ] Create new app (or use existing)
- [ ] Configure OAuth settings:
  - Redirect URL: `http://localhost:3000/api/auth/linkedin/callback`
  - Scopes: `r_liteprofile`, `w_member_social`
- [ ] Copy credentials:
  - Client ID: ___________________________
  - Client Secret: ___________________________
- [ ] Add to Postiz: Settings → Integrations → LinkedIn
- [ ] Test connection with personal account

#### X (Twitter) Integration
- [ ] Go to https://developer.twitter.com/en/portal/dashboard
- [ ] Create new app (or use existing)
- [ ] Enable OAuth 2.0
- [ ] Configure settings:
  - Callback URL: `http://localhost:3000/api/auth/twitter/callback`
  - Scopes: `tweet.read`, `tweet.write`, `users.read`
- [ ] Copy credentials:
  - API Key: ___________________________
  - API Secret: ___________________________
  - Bearer Token: ___________________________
- [ ] Add to Postiz: Settings → Integrations → X
- [ ] Test connection with personal account

#### Instagram Integration (Optional for v1)
- [ ] Go to https://developers.facebook.com/apps
- [ ] Create new app (or use existing)
- [ ] Add Instagram Basic Display
- [ ] Configure settings:
  - Redirect URL: `http://localhost:3000/api/auth/instagram/callback`
- [ ] Copy credentials:
  - App ID: ___________________________
  - App Secret: ___________________________
- [ ] Add to Postiz: Settings → Integrations → Instagram
- [ ] Test connection with personal account

### Step 4: Generate API Key
- [ ] In Postiz: Settings → API Keys
- [ ] Click "Generate New API Key"
- [ ] Name: "LibreChat Integration"
- [ ] Copy API key: ___________________________
- [ ] Save securely (you'll need this for LibreChat)

### Step 5: Test Postiz

#### Manual UI Test
- [ ] Create a test post in Postiz UI
- [ ] Select connected account (LinkedIn or X)
- [ ] Post text: "Testing Postiz integration for LibreChat"
- [ ] Submit post
- [ ] Verify post appears on social platform
- [ ] Check post status in Postiz

#### API Test
```bash
# Test health endpoint
curl -X GET http://localhost:3000/api/health

# Test authentication (replace YOUR_API_KEY)
curl -X GET http://localhost:3000/api/integrations \
  -H "Authorization: Bearer YOUR_API_KEY"
```

- [ ] Health endpoint returns 200 OK
- [ ] Integrations endpoint returns connected accounts
- [ ] API key authentication works

### Step 6: Update LibreChat Configuration
- [ ] Open LibreChat `.env` file
- [ ] Add Postiz configuration:
```env
# Postiz Configuration
POSTIZ_API_URL=http://localhost:3000/api
POSTIZ_API_KEY=your_api_key_from_step_4
POSTIZ_WEBHOOK_SECRET=generate_random_string
```
- [ ] Generate webhook secret (PowerShell):
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```
- [ ] Save `.env` file
- [ ] Restart LibreChat (if running)

---

## Verification Checklist

### Postiz Deployment
- [ ] All 3 containers running (postiz, postgres, redis)
- [ ] Postiz UI accessible at http://localhost:3000
- [ ] No errors in logs
- [ ] Admin account created and login works

### Social Platform Connections
- [ ] At least 1 platform connected (LinkedIn or X recommended)
- [ ] Test post successful via Postiz UI
- [ ] Post visible on social platform
- [ ] Account shows as "Active" in Postiz

### API Configuration
- [ ] API key generated
- [ ] API health check passes
- [ ] API authentication works
- [ ] Integrations endpoint returns data

### LibreChat Integration
- [ ] `.env` updated with Postiz credentials
- [ ] All 3 environment variables set:
  - `POSTIZ_API_URL`
  - `POSTIZ_API_KEY`
  - `POSTIZ_WEBHOOK_SECRET`

---

## Troubleshooting

### Issue: Containers won't start
```bash
# Check logs
docker compose logs postiz

# Check port conflicts
netstat -an | findstr :3000

# Restart
docker compose restart
```

### Issue: Can't access Postiz UI
- Check firewall settings
- Try http://127.0.0.1:3000
- Check container logs: `docker compose logs -f postiz`
- Verify container is healthy: `docker compose ps`

### Issue: Social platform connection fails
- Verify OAuth credentials are correct
- Check redirect URLs match exactly
- Ensure app is in development mode
- Check platform API status pages

### Issue: API key doesn't work
- Verify key was copied correctly (no extra spaces)
- Check key format: `postiz_live_...`
- Regenerate key if needed
- Test with curl command above

---

## Phase D1 Completion Criteria

Phase D1 is complete when ALL of the following are true:

- ✅ Postiz deployed and running
- ✅ Admin account created
- ⏳ At least 1 social platform connected and tested (OPTIONAL - can do later)
- ⏳ API key generated (DO THIS NOW)
- ⏳ API endpoints tested and working
- ⏳ LibreChat `.env` updated with Postiz credentials
- ⏳ Test post successfully published via Postiz UI (OPTIONAL - can do later)

**Current Status:** 2/7 complete (Postiz running, account created)

---

## Next Phase

Once Phase D1 is complete, proceed to:

**Phase D2: User Account Connection Flow**
- Design user flow for connecting social accounts
- Implement OAuth proxy in LibreChat
- Create UI for managing connected accounts
- Store Postiz account mappings

---

## Notes & Issues

**Date:** ___________  
**Issue:** ___________________________________________________________  
**Resolution:** ______________________________________________________

**Date:** ___________  
**Issue:** ___________________________________________________________  
**Resolution:** ______________________________________________________

---

## Sign-Off

- [ ] Phase D1 completed successfully
- [ ] All verification checks passed
- [ ] Ready to proceed to Phase D2

**Completed by:** ___________________________  
**Date:** ___________________________  
**Time spent:** ___________________________

---

*Created: 2026-02-19*
*Phase: D1 - Postiz Setup & Configuration*
