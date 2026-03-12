# LinkedIn API Integration - Setup Guide

This guide will walk you through setting up LinkedIn API integration for LibreChat.

---

## Step 1: Create LinkedIn Developer App

### 1.1 Go to LinkedIn Developers Portal
Visit: https://www.linkedin.com/developers/apps

### 1.2 Create New App
1. Click **"Create app"** button
2. Fill in the required information:
   - **App name**: `LibreChat Social Integration` (or your preferred name)
   - **LinkedIn Page**: Select your company page (or create one if needed)
   - **App logo**: Upload your logo (optional but recommended)
   - **Legal agreement**: Check the box to agree to terms

3. Click **"Create app"**

### 1.3 Get Your Credentials
After creating the app, you'll see:
- **Client ID**: Copy this (starts with numbers)
- **Client Secret**: Click "Show" and copy this

**⚠️ Important**: Keep your Client Secret secure! Never commit it to version control.

---

## Step 2: Configure App Settings

### 2.1 Add Redirect URLs
1. In your app dashboard, go to **"Auth"** tab
2. Under **"OAuth 2.0 settings"**, find **"Redirect URLs"**
3. Add these URLs:
   - For local development: `http://localhost:3090/api/linkedin/callback`
   - For production: `https://app.jamot.pro/api/linkedin/callback`
4. Click **"Update"**

### 2.2 Request API Products

**For App #1 (Main App - Posting Only)**
1. Go to **"Products"** tab
2. Request access to these products:

   **a) Sign In with LinkedIn using OpenID Connect**
   - Click **"Request access"**
   - Status: Usually instant approval ✅

   **b) Share on LinkedIn**
   - Click **"Request access"**
   - Status: Usually instant approval ✅

**⚠️ Important Note About Community Management API**

LinkedIn requires the **Community Management API** to be on a **separate app** for legal and security reasons. You have two options:

**Option A: Start with Posting Only (Recommended)**
- Use your current app for posting
- Skip Community Management API for now
- You can still create posts ✅
- Comments/replies won't work yet ⏳
- Add later when needed

**Option B: Create Second App for Comments (Advanced)**
If you need comments/replies immediately:

1. Create a **second LinkedIn app**:
   - Go back to https://www.linkedin.com/developers/apps
   - Click **"Create app"** again
   - Name it: `LibreChat Social Integration - Comments`
   - Use same company page

2. In the **second app**, request:
   - **Community Management API** only
   - Fill in the application form:
     - **Use case**: "User-generated content management and engagement"
     - **Description**: "Allow users to comment and engage on LinkedIn through our platform"
   - Status: May take 1-2 business days for review

3. Get credentials from **second app**:
   - Copy Client ID and Secret
   - Add to `.env` as:
     ```env
     LINKEDIN_COMMENTS_CLIENT_ID=second_app_client_id
     LINKEDIN_COMMENTS_CLIENT_SECRET=second_app_client_secret
     ```

**Recommendation**: Start with Option A (posting only). Add comments later when you have users actively requesting it.

### 2.3 Verify Permissions
Once approved, verify you have these scopes in your **main app**:
- ✅ `openid` - Use your name and photo
- ✅ `profile` - Use your name and photo  
- ✅ `w_member_social` - Create, modify, and delete posts, comments, and reactions on your behalf
- ✅ `email` - Use the primary email address associated with your LinkedIn account

**✅ PERFECT! These are the correct modern scopes!** You're all set to proceed.

**Important Notes**:
- `r_basicprofile` is deprecated - you don't need it (the `profile` scope replaces it)
- Comments and replies require the Community Management API on a separate app
- For now, you can post to LinkedIn without Community Management API
- This is the recommended approach for initial launch

---

## Step 3: Configure LibreChat Environment

### 3.1 Update .env File
Add these variables to your `.env` file:

```env
# LinkedIn API Integration
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here
LINKEDIN_REDIRECT_URI=http://localhost:3090/api/linkedin/callback
```

**For Production:**
```env
LINKEDIN_REDIRECT_URI=https://app.jamot.pro/api/linkedin/callback
```

### 3.2 Restart Server
```bash
# Stop the server (Ctrl+C)
# Start it again
npm run backend
```

You should see in the logs:
```
[OK] LinkedIn API routes loaded
```

---

## Step 4: Test the Integration

### 4.1 Connect Your LinkedIn Account
1. Start your LibreChat server
2. Log in to LibreChat
3. Go to **Settings** → **Social Accounts**
4. Click **"Connect LinkedIn"**
5. You'll be redirected to LinkedIn
6. Authorize the app
7. You'll be redirected back to LibreChat

### 4.2 Verify Connection
Check that you see:
- ✅ "LinkedIn Connected"
- Your LinkedIn profile name
- Connection timestamp

### 4.3 Test Posting
Try creating a test post:
```bash
curl -X POST http://localhost:3090/api/linkedin/posts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test post from LibreChat! 🚀"
  }'
```

---

## Step 5: Integrate with n8n Workflow

### 5.1 Update n8n Workflow
In your social media draft workflow, after the approval branch:

**Add HTTP Request Node: "Post to LinkedIn"**
- Method: `POST`
- URL: `http://localhost:3090/api/linkedin/posts`
- Authentication: None (handled by LibreChat)
- Headers:
  ```json
  {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{$json.userToken}}"
  }
  ```
- Body:
  ```json
  {
    "content": "{{$json.linkedinDraft}}",
    "visibility": "PUBLIC"
  }
  ```

### 5.2 Update socialDrafts.js
Modify the approval endpoint to pass user token to n8n:

```javascript
// In api/server/routes/socialDrafts.js
const account = await SocialAccount.findOne({ 
  userId: draft.userId, 
  platform: 'linkedin' 
});

if (account) {
  const resumeUrl = new URL(draft.resumeUrl);
  resumeUrl.searchParams.append('linkedinConnected', 'true');
  resumeUrl.searchParams.append('selectedPlatforms', JSON.stringify(selectedPlatforms));
  
  await axios.get(resumeUrl.toString(), { timeout: 15000 });
}
```

---

## Troubleshooting

### Issue: "LinkedIn account not connected"
**Solution**: User needs to connect their LinkedIn account first
- Go to Settings → Social Accounts
- Click "Connect LinkedIn"

### Issue: "Failed to exchange code for token"
**Possible causes**:
1. Wrong Client ID or Client Secret
2. Redirect URI mismatch
3. Code expired (codes expire after 30 seconds)

**Solution**: 
- Verify credentials in .env
- Check redirect URI matches exactly in LinkedIn app settings
- Try connecting again

### Issue: "Failed to create post"
**Possible causes**:
1. Token expired
2. Missing `w_member_social` permission
3. LinkedIn API rate limit

**Solution**:
- Reconnect LinkedIn account (refreshes token)
- Verify "Share on LinkedIn" product is approved
- Wait a few minutes if rate limited

### Issue: "Community Management API not approved"
**Solution**: 
- Comments/replies won't work until approved
- Posting will still work
- Check application status in LinkedIn Developer Portal
- Usually approved within 1-2 business days

### Issue: "Cannot request Community Management API - other products exist"
**This is expected!** LinkedIn requires Community Management API to be on a separate app.

**Solution**:
1. **For now**: Skip Community Management API
   - Your current app can post to LinkedIn ✅
   - Comments/replies won't work yet ⏳
   - This is fine for initial testing

2. **When you need comments**:
   - Create a second LinkedIn app
   - Request Community Management API on that app only
   - Use separate credentials for comments

3. **Why LinkedIn does this**:
   - Security: Comments API has more sensitive permissions
   - Legal: Different terms of service
   - Isolation: Keeps posting and commenting separate

**Recommendation**: Start with posting only. Most users just need posting functionality initially.

---

## API Rate Limits

### Development Tier (FREE)
- **Limit**: 100-500 API calls per day per user
- **Sufficient for**: Development and testing
- **Upgrade**: Not needed for basic use

### Standard Tier (FREE)
- **Limit**: Higher limits (varies by endpoint)
- **When to apply**: When you have real users
- **How to apply**: In LinkedIn Developer Portal → Products → Apply for Standard tier

### Monitoring Usage
Check your API usage in LinkedIn Developer Portal:
1. Go to your app
2. Click "Analytics" tab
3. View API call statistics

---

## Security Best Practices

### 1. Protect Your Credentials
- ✅ Store in `.env` file
- ✅ Add `.env` to `.gitignore`
- ❌ Never commit credentials to Git
- ❌ Never share Client Secret publicly

### 2. Token Management
- Tokens are stored encrypted in MongoDB
- Tokens auto-refresh before expiration
- Users can disconnect anytime

### 3. User Privacy
- Only access data user explicitly authorizes
- Respect LinkedIn's API Terms of Service
- Don't store unnecessary user data

---

## Next Steps

### Phase 1: Basic Integration (Week 1-2)
- [x] Create LinkedIn Developer App
- [x] Configure environment variables
- [x] Test OAuth flow
- [x] Test posting

### Phase 2: Full Features (Week 3-4)
- [ ] Implement comments
- [ ] Implement replies
- [ ] Add to n8n workflow
- [ ] Test with real users

### Phase 3: Production (Week 5+)
- [ ] Apply for Standard tier
- [ ] Update redirect URI to production
- [ ] Monitor API usage
- [ ] Gather user feedback

---

## Support Resources

### LinkedIn Documentation
- **Developer Portal**: https://www.linkedin.com/developers/
- **OAuth Guide**: https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication
- **Share API**: https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
- **Comments API**: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/comments-api

### LibreChat Resources
- **Main Docs**: https://www.librechat.ai/docs
- **GitHub Issues**: https://github.com/danny-avila/LibreChat/issues

---

## FAQ

**Q: Is this really free?**
A: Yes! LinkedIn's basic API is 100% free for development and production use.

**Q: How many users can I support?**
A: Unlimited users. Each user connects their own LinkedIn account.

**Q: What about rate limits?**
A: Development tier gives 100-500 calls/day per user. Standard tier (also free) has higher limits.

**Q: Can I post to company pages?**
A: Yes, but you need additional permissions. Request "Organization Access" in your app settings.

**Q: How long does API approval take?**
A: "Sign In" and "Share" are instant. "Community Management" takes 1-2 business days.

**Q: Can I switch to Ayrshare later?**
A: Yes! The implementation is designed to make migration easy.

---

**Last Updated**: March 10, 2026  
**Status**: Ready for Implementation  
**Estimated Setup Time**: 30-60 minutes
