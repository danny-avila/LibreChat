# Postiz OAuth Setup Required

**Date:** 2026-02-24  
**Status:** Phase D2 UI Complete - OAuth Configuration Needed

---

## Current Status

✅ **What's Working:**
- Social Accounts tab in Settings
- Platform list displays correctly
- Authentication working (no more 401 errors)
- Per-platform loading states
- UI fully functional

❌ **What's Not Working:**
- Connecting accounts returns 500 error
- Postiz OAuth apps not configured

---

## The Issue

When you click "Connect" on a platform (e.g., TikTok, X/Twitter), you get:
```
500 Internal Server Error
{"error": "Failed to initiate connection", "message": "Failed to initiate tiktok connection"}
```

This happens because:
1. Postiz requires OAuth apps to be configured for each platform
2. Each platform (LinkedIn, X, TikTok, etc.) needs OAuth credentials
3. These credentials must be added to Postiz before connections can be initiated

---

## How Postiz OAuth Works

### Architecture
```
User → LibreChat → Postiz → Platform (LinkedIn/X/etc.)
                      ↓
                OAuth Apps Config
```

### Flow
1. User clicks "Connect" in LibreChat
2. LibreChat calls Postiz API: `/api/integrations/social-connect/{platform}`
3. Postiz checks if OAuth app is configured for that platform
4. If configured: Returns OAuth URL
5. If not configured: Returns error (current situation)

---

## What Needs to Be Done

### Option 1: Configure OAuth Apps in Postiz (Recommended for Testing)

For each platform you want to support, you need to:

#### 1. Create Developer App on Platform

**LinkedIn:**
1. Go to https://www.linkedin.com/developers/
2. Create new app
3. Add OAuth redirect URL: `http://localhost:4007/api/integrations/callback/linkedin`
4. Get Client ID and Client Secret

**X (Twitter):**
1. Go to https://developer.twitter.com/
2. Create new app
3. Enable OAuth 2.0
4. Add callback URL: `http://localhost:4007/api/integrations/callback/twitter`
5. Get Client ID and Client Secret

**TikTok:**
1. Go to https://developers.tiktok.com/
2. Create new app
3. Add redirect URI: `http://localhost:4007/api/integrations/callback/tiktok`
4. Get Client Key and Client Secret

(Similar process for Instagram, Facebook, YouTube, Pinterest)

#### 2. Add Credentials to Postiz

**Method A: Through Postiz UI**
1. Open http://localhost:4007
2. Go to Settings → Integrations
3. Find each platform
4. Enter OAuth credentials
5. Save

**Method B: Through Docker Environment Variables**
Edit `postiz-docker-compose/docker-compose.yaml`:
```yaml
services:
  postiz-backend:
    environment:
      # LinkedIn
      LINKEDIN_CLIENT_ID: your_client_id
      LINKEDIN_CLIENT_SECRET: your_client_secret
      
      # X (Twitter)
      TWITTER_CLIENT_ID: your_client_id
      TWITTER_CLIENT_SECRET: your_client_secret
      
      # TikTok
      TIKTOK_CLIENT_KEY: your_client_key
      TIKTOK_CLIENT_SECRET: your_client_secret
      
      # Add others as needed...
```

Then restart Postiz:
```bash
cd postiz-docker-compose
docker-compose restart
```

#### 3. Test Connection
1. Return to LibreChat Settings → Social Accounts
2. Click "Connect" on configured platform
3. Should redirect to platform OAuth page
4. Authorize
5. Should redirect back with connected account

---

### Option 2: Use Postiz UI Directly (Temporary Workaround)

If you just want to test posting functionality without setting up OAuth:

1. Open Postiz at http://localhost:4007
2. Click "Add Channel" in Postiz UI
3. Connect accounts directly through Postiz
4. Once connected, LibreChat can use those connections via API

**Limitation:** Users would need to connect accounts in Postiz, not LibreChat

---

### Option 3: Skip OAuth for Now (Development Only)

For development/testing, you could:
1. Connect accounts manually in Postiz UI
2. Continue with Phase D3 (posting interface)
3. Come back to OAuth setup later

---

## Recommended Next Steps

### For Immediate Testing
1. Choose 1-2 platforms to test (e.g., LinkedIn + X)
2. Create developer apps on those platforms
3. Configure OAuth in Postiz
4. Test full OAuth flow through LibreChat

### For Production
1. Create developer apps for all supported platforms
2. Configure OAuth credentials in Postiz
3. Document OAuth setup process for deployment
4. Add environment variable validation
5. Add better error messages for missing OAuth config

---

## Error Messages to Improve

Current error is generic. We should add:
- Check if Postiz is running
- Check if OAuth app is configured
- Provide link to setup documentation
- Show which platforms are ready vs. need setup

Example improved error:
```
"TikTok OAuth not configured in Postiz. 
Please configure TikTok OAuth credentials in Postiz Settings → Integrations.
See documentation: [link]"
```

---

## Files to Update

### Backend
- `api/server/services/PostizService.js` - Better error handling ✅ (partially done)
- `api/server/routes/social.js` - Add OAuth config validation

### Frontend
- `client/src/components/Profile/Settings/SocialAccountsSettings.tsx` - Better error messages ✅ (done)
- Add "Setup Guide" link or modal

### Documentation
- Create OAuth setup guide
- Add to deployment documentation
- Add troubleshooting section

---

## Testing Checklist

Once OAuth is configured:
- [ ] Click "Connect" on LinkedIn
- [ ] Redirects to LinkedIn OAuth page
- [ ] Authorize app
- [ ] Redirects back to LibreChat
- [ ] Account shows as "Connected"
- [ ] Can disconnect account
- [ ] Repeat for other platforms

---

## Summary

Phase D2 UI is complete and working! The only blocker is OAuth configuration in Postiz, which is expected and normal. This is not a bug - it's a required setup step for any OAuth-based integration.

**To proceed:**
1. Decide which platforms to support initially
2. Create developer apps on those platforms
3. Configure OAuth in Postiz
4. Test OAuth flow
5. Move to Phase D3 (posting interface)

**Or:**
- Use Postiz UI to connect accounts temporarily
- Continue with Phase D3 development
- Come back to OAuth setup later

---

*Last updated: 2026-02-24*
