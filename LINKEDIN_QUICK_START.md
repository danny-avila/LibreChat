# LinkedIn Integration - Quick Start Checklist

Follow this checklist to get LinkedIn integration working in 30 minutes.

---

## ✅ Pre-Implementation Checklist

### Backend Files Created
- [x] `api/server/services/LinkedInService.js` - LinkedIn API service
- [x] `api/server/routes/linkedin.js` - LinkedIn routes
- [x] `api/models/SocialAccount.js` - Updated model (supports LinkedIn tokens)
- [x] `api/server/index.js` - Routes registered

### Frontend Files Created
- [x] `client/src/components/Profile/Settings/LinkedInAccountSettings.tsx` - Settings UI

### Documentation Created
- [x] `LINKEDIN_SETUP_GUIDE.md` - Detailed setup instructions
- [x] `LINKEDIN_FREE_DEVELOPMENT_OPTIONS.md` - Integration options
- [x] `LINKEDIN_QUICK_START.md` - This checklist

---

## 🚀 Implementation Steps

### Step 1: LinkedIn Developer Setup (COMPLETE ✅)

- [x] **1.1** Go to https://www.linkedin.com/developers/apps ✅
- [x] **1.2** Click "Create app" ✅
- [x] **1.3** Fill in app details ✅
- [x] **1.4** Copy **Client ID** ✅
- [x] **1.5** Copy **Client Secret** ✅
- [x] **1.6** Go to "Auth" tab → Add redirect URLs ✅
- [x] **1.7** Go to "Products" tab → Request access ✅
  - ✅ Sign In with LinkedIn using OpenID Connect (approved)
  - ✅ Share on LinkedIn (approved)
  - ⏸️ Community Management API (deferred - requires separate app)
  
**✅ COMPLETE!** Your LinkedIn app is configured correctly with these scopes:
- `openid` ✅
- `profile` ✅ (replaces deprecated `r_basicprofile`)
- `email` ✅
- `w_member_social` ✅

**Note**: Community Management API must be on a separate app for security reasons. This is normal LinkedIn behavior. You can post without it!

---

### Step 2: Configure Environment (5 minutes)

- [ ] **2.1** Open `.env` file
- [ ] **2.2** Add LinkedIn credentials:
  ```env
  LINKEDIN_CLIENT_ID=your_client_id_here
  LINKEDIN_CLIENT_SECRET=your_client_secret_here
  LINKEDIN_REDIRECT_URI=http://localhost:3090/api/linkedin/callback
  ```
- [ ] **2.3** Save the file
- [ ] **2.4** Restart your backend server:
  ```bash
  # Stop server (Ctrl+C)
  npm run backend
  ```
- [ ] **2.5** Verify in logs: `[OK] LinkedIn API routes loaded`

---

### Step 3: Test Backend API (5 minutes)

- [ ] **3.1** Check LinkedIn status endpoint:
  ```bash
  curl http://localhost:3090/api/linkedin/status \
    -H "Authorization: Bearer YOUR_JWT_TOKEN"
  ```
  Expected: `{"connected": false, "account": null}`

- [ ] **3.2** Test OAuth initiation:
  - Open browser: `http://localhost:3090/api/linkedin/connect`
  - Should redirect to LinkedIn (or show error if not logged in)

- [ ] **3.3** If you see LinkedIn authorization page: ✅ Backend working!

---

### Step 4: Add Frontend UI (5 minutes)

- [ ] **4.1** Import the LinkedIn settings component in your settings page
  
  In `client/src/components/Profile/Settings/index.tsx` (or wherever settings are):
  ```typescript
  import LinkedInAccountSettings from './LinkedInAccountSettings';
  
  // Add to your settings tabs/sections:
  <LinkedInAccountSettings />
  ```

- [ ] **4.2** Or create a new tab in settings:
  ```typescript
  {tab === 'linkedin' && <LinkedInAccountSettings />}
  ```

- [ ] **4.3** Rebuild frontend:
  ```bash
  npm run frontend
  ```

---

### Step 5: Test Full Flow (5 minutes)

- [ ] **5.1** Start both servers:
  ```bash
  # Terminal 1
  npm run backend
  
  # Terminal 2
  npm run frontend
  ```

- [ ] **5.2** Open LibreChat: `http://localhost:3080`

- [ ] **5.3** Log in to LibreChat

- [ ] **5.4** Go to Settings → LinkedIn (or Social Accounts)

- [ ] **5.5** Click "Connect LinkedIn"

- [ ] **5.6** Authorize on LinkedIn

- [ ] **5.7** Verify you're redirected back with success message

- [ ] **5.8** Check that LinkedIn shows as "Connected"

---

### Step 6: Test Posting (5 minutes)

- [ ] **6.1** Test creating a post via API:
  ```bash
  curl -X POST http://localhost:3090/api/linkedin/posts \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "content": "Test post from LibreChat! 🚀 #testing"
    }'
  ```

- [ ] **6.2** Check your LinkedIn profile - post should appear!

- [ ] **6.3** If post appears: ✅ Integration working!

---

## 🔧 Troubleshooting

### Issue: "LinkedIn API routes not loaded"
**Check:**
- [ ] Files exist in correct locations
- [ ] No syntax errors in JavaScript files
- [ ] Server restarted after adding files

**Fix:**
```bash
# Check for errors
npm run backend

# Look for: [OK] LinkedIn API routes loaded
```

---

### Issue: "Failed to exchange code for token"
**Check:**
- [ ] Client ID and Secret are correct in `.env`
- [ ] Redirect URI matches exactly in LinkedIn app settings
- [ ] No extra spaces in `.env` values

**Fix:**
1. Verify credentials in LinkedIn Developer Portal
2. Copy-paste again (avoid typos)
3. Restart server

---

### Issue: "OAuth redirect not working"
**Check:**
- [ ] Redirect URI in `.env` matches LinkedIn app settings
- [ ] Using correct port (3090 for backend)
- [ ] No firewall blocking

**Fix:**
```env
# Make sure these match:
# In .env:
LINKEDIN_REDIRECT_URI=http://localhost:3090/api/linkedin/callback

# In LinkedIn app settings:
http://localhost:3090/api/linkedin/callback
```

---

### Issue: "Failed to create post"
**Check:**
- [ ] LinkedIn account is connected
- [ ] "Share on LinkedIn" product is approved
- [ ] Token hasn't expired

**Fix:**
1. Disconnect and reconnect LinkedIn
2. Check LinkedIn Developer Portal for product approval status
3. Try again

---

## 📝 Next Steps After Setup

### Immediate (Today)
- [ ] Test posting from LibreChat
- [ ] Test with 2-3 different users
- [ ] Verify tokens refresh automatically

### This Week
- [ ] Apply for Community Management API (if not approved yet)
- [ ] Test comments once approved
- [ ] Test replies once approved
- [ ] Integrate with n8n workflow

### Next Week
- [ ] Add LinkedIn posting to social draft approval flow
- [ ] Test with real content
- [ ] Gather user feedback
- [ ] Monitor API usage in LinkedIn Developer Portal

---

## 🎯 Success Criteria

You're done when:
- [x] Backend files created
- [x] Environment variables configured
- [x] LinkedIn app created and configured
- [ ] User can connect LinkedIn account
- [ ] User can create posts
- [ ] Posts appear on LinkedIn
- [ ] No errors in console

---

## 📚 Additional Resources

- **Detailed Setup**: See `LINKEDIN_SETUP_GUIDE.md`
- **Integration Options**: See `LINKEDIN_FREE_DEVELOPMENT_OPTIONS.md`
- **LinkedIn Docs**: https://learn.microsoft.com/en-us/linkedin/

---

## 🆘 Need Help?

### Common Questions

**Q: Do I need to pay for LinkedIn API?**
A: No! It's 100% free for development and basic production use.

**Q: How long does API approval take?**
A: "Sign In" and "Share" are instant. "Community Management" takes 1-2 business days.

**Q: Can I test without approval?**
A: Yes! Posting works immediately. Comments/replies need Community Management API approval.

**Q: What if I get rate limited?**
A: Development tier allows 100-500 calls/day per user. Upgrade to Standard tier (also free) for higher limits.

---

**Estimated Total Time**: 30-40 minutes  
**Difficulty**: Medium  
**Prerequisites**: LinkedIn account, LibreChat running locally

---

**Last Updated**: March 10, 2026  
**Status**: Ready to implement  
**Next**: Follow Step 1 above
