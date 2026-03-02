# Deploy Postiz to Production - Action Items

## Current Status
- ✅ Postiz API key updated in LibreChat `.env`
- ✅ Twitter OAuth credentials configured in `postiz-deployment/.env`
- ✅ LinkedIn OAuth credentials configured
- ✅ Docker deployment script created
- ❌ Docker image pull error needs to be fixed
- ❌ Twitter callback URLs need to be added to Twitter Developer Portal

## Step 1: Fix Docker Deployment Error

The error "No such image: ghcr.io/gitroomhq/postiz-app:latest" happens because Coolify doesn't pull the image before starting containers.

### Solution: Deploy with Image Pull

**Option A: Use the deployment script (if Coolify supports it)**
```bash
cd postiz-deployment
chmod +x deploy.sh
./deploy.sh
```

**Option B: Manual pull then deploy**
```bash
# SSH into your server
cd /path/to/postiz-deployment

# Pull the image first
docker pull ghcr.io/gitroomhq/postiz-app:latest

# Then deploy
docker compose down
docker compose up -d
```

**Option C: Update Coolify deployment command**
If Coolify allows custom deployment commands, change it to:
```bash
docker pull ghcr.io/gitroomhq/postiz-app:latest && docker compose up -d
```

## Step 2: Add Twitter Callback URLs

Go to your Twitter Developer Portal and add these callback URLs to your app:

```
https://postiz.cloud.jamot.pro/integrations/social/x
https://postiz.cloud.jamot.pro/integrations/social/twitter
https://postiz.cloud.jamot.pro/api/integrations/social/x/callback
https://postiz.cloud.jamot.pro/api/integrations/social/twitter/callback
https://postiz.cloud.jamot.pro/api/integrations/callback/x
https://postiz.cloud.jamot.pro/api/integrations/callback/twitter
```

**Important**: Make sure your Twitter app settings are:
- Type: "Web App, Automated App or Bot"
- Permissions: "Read and write"

## Step 3: Restart Postiz

After adding callback URLs:
```bash
docker compose restart postiz
```

Or use the quick-fix script:
```bash
cd postiz-deployment
./quick-fix.sh
```

## Step 4: Connect Social Accounts

1. Visit https://postiz.cloud.jamot.pro
2. Log in to Postiz
3. Go to Settings → Integrations
4. Connect Twitter/X account
5. Connect LinkedIn account

## Step 5: Test End-to-End Flow

1. In LibreChat, create a draft idea
2. n8n generates optimized posts
3. Approve the draft (PostComposer opens immediately)
4. Edit content in PostComposer
5. Click "Post Now"
6. Verify post appears on Twitter/LinkedIn

## Verification Checklist

- [ ] Postiz is accessible at https://postiz.cloud.jamot.pro
- [ ] No "gateway timeout" errors
- [ ] Twitter callback URLs added to Developer Portal
- [ ] Twitter account connected in Postiz
- [ ] LinkedIn account connected in Postiz
- [ ] Draft approval opens PostComposer immediately
- [ ] Approved drafts in sidebar open PostComposer
- [ ] Can post to Twitter via Postiz
- [ ] Can post to LinkedIn via Postiz

## Monitoring

After deployment, monitor stability:
```bash
cd postiz-deployment
./monitor.sh
```

Check logs:
```bash
docker compose logs -f postiz
```

## Troubleshooting

If Postiz becomes inaccessible:
```bash
cd postiz-deployment
./diagnose.sh
./quick-fix.sh
```

## Files Changed in This Update

1. `postiz-deployment/docker-compose.yml` - Removed `pull_policy` for compatibility
2. `postiz-deployment/deploy.sh` - New deployment script with image pull
3. `postiz-deployment/DEPLOYMENT.md` - Deployment guide
4. `.env` (lines 837-845) - Postiz API key already updated
5. `postiz-deployment/.env` - Twitter credentials already configured

## Next Steps After Successful Deployment

1. Monitor Postiz stability for 24 hours
2. Test posting to multiple platforms
3. Verify n8n workflow integration
4. Consider adding more social platforms (Facebook, Instagram, etc.)
