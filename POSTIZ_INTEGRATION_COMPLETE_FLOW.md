# Postiz Integration - Complete Flow

## Overview

The Postiz integration connects the existing n8n social draft workflow with Postiz for posting to social media platforms. This document explains the complete end-to-end flow.

## Complete User Flow

```
1. User creates draft idea
   ↓
2. n8n generates AI-optimized posts
   ↓
3. Draft saved to MongoDB (status: pending)
   ↓
4. User reviews and approves draft
   ↓
5. PostComposer opens with draft content
   ↓
6. User edits and selects platforms
   ↓
7. Post sent to Postiz API
   ↓
8. Postiz publishes to social media
```

## Detailed Flow

### Step 1: Create Draft Idea

**Location:** LibreChat → Social Draft Modal

**User Action:**
- Click "Start Social Draft" in sidebar
- Enter raw idea (e.g., "Launching our new product next week")
- Click "Generate drafts"

**Backend:**
- POST `/api/n8n-tools/execute`
- Payload: `{ functionName: "Social Media Draft", parameters: { rawIdea: "..." } }`
- Calls n8n webhook

### Step 2: n8n Generates Drafts

**n8n Workflow:**
1. Receives raw idea from LibreChat
2. LLM (GPT-4/Claude) generates platform-specific drafts:
   - LinkedIn (professional tone, 3000 char limit)
   - X/Twitter (concise, 280 char limit)
   - Instagram (visual focus, 2200 char limit)
   - Facebook (casual, 63206 char limit)
   - Farcaster (web3 community)
3. Workflow pauses at Wait node
4. Returns `resumeUrl` for approval

### Step 3: Save Draft to MongoDB

**Backend:** POST `/api/social-drafts` (called by n8n)

**Payload:**
```json
{
  "userId": "user_id",
  "drafts": {
    "linkedin": "Professional post text...",
    "x": "Concise tweet...",
    "instagram": "Visual caption...",
    "facebook": "Casual post...",
    "farcaster": "Web3 post..."
  },
  "resumeUrl": "https://n8n.../resume/...",
  "executionId": "exec_123",
  "rawIdea": "Original idea text",
  "status": "pending"
}
```

**Database:** `SocialDraft` model in MongoDB

### Step 4: User Reviews & Approves

**Location:** Social Draft Modal → Pending Drafts section

**User sees:**
- List of pending drafts
- Preview of first 15 words
- Platforms included
- Created timestamp

**User actions:**
- Click "View" to see full draft content
- Click "Approve" to accept
- Click "Reject" to decline

**Backend:** POST `/api/social-drafts/:id/approve`

**Payload:**
```json
{
  "approved": true,
  "selectedPlatforms": ["linkedin", "x", "instagram"]
}
```

**What happens:**
1. Draft status updated to "approved" in MongoDB
2. n8n `resumeUrl` called with approval status
3. n8n workflow resumes (currently ends, will post in Phase D)
4. **PostComposer opens** with draft content

### Step 5: PostComposer Opens

**Component:** `PostComposer.tsx`

**Pre-filled:**
- Content: First non-empty draft text
- User can edit before posting

**User sees:**
- Text editor with draft content
- List of connected social accounts (checkboxes)
- Character counter (updates based on selected platforms)
- "Post Now" button

### Step 6: User Edits & Selects Platforms

**User actions:**
- Edit the draft content
- Select which accounts to post to (LinkedIn, Twitter, etc.)
- Watch character counter
- Click "Post Now"

**Validation:**
- Content cannot be empty
- At least one account must be selected
- Content must be within character limit

### Step 7: Post to Postiz

**Backend:** POST `/api/social/posts`

**Payload:**
```json
{
  "content": "Edited post content...",
  "integrationIds": ["postiz_integration_id_1", "postiz_integration_id_2"]
}
```

**PostizService:**
```javascript
await PostizService.createPost({
  content: content.trim(),
  integrations: integrationIds,
});
```

**Postiz API:** POST `https://postiz.cloud.jamot.pro/api/posts`

### Step 8: Postiz Publishes

**Postiz:**
1. Receives post request
2. Uses stored OAuth tokens for each platform
3. Posts to LinkedIn, Twitter, Instagram, etc.
4. Returns success/failure status

**User sees:**
- Success toast: "Post published successfully!"
- Modal closes after 2 seconds
- Post appears on social media platforms

## Components Involved

### Frontend

| Component | Purpose | Location |
|-----------|---------|----------|
| `SocialDraftModal` | Create ideas, view/approve drafts | `client/src/components/SocialDraft/` |
| `PostComposer` | Edit and post to Postiz | `client/src/components/Social/` |
| `SocialShareButton` | Floating button to open PostComposer | `client/src/components/Social/` |
| `SocialAccountsSettings` | Connect social accounts | `client/src/components/Profile/Settings/` |
| `useSocialAccounts` | Hook for API calls | `client/src/hooks/` |

### Backend

| Route | Purpose | File |
|-------|---------|------|
| POST `/api/n8n-tools/execute` | Trigger n8n workflow | `api/server/routes/n8n.js` |
| GET `/api/social-drafts` | List user's drafts | `api/server/routes/socialDrafts.js` |
| POST `/api/social-drafts` | Save draft from n8n | `api/server/routes/socialDrafts.js` |
| POST `/api/social-drafts/:id/approve` | Approve/reject draft | `api/server/routes/socialDrafts.js` |
| POST `/api/social/posts` | Create post via Postiz | `api/server/routes/social.js` |
| GET `/api/social/accounts` | List connected accounts | `api/server/routes/social.js` |
| POST `/api/social/connect/:platform` | Connect social account | `api/server/routes/social.js` |

### Services

| Service | Purpose | File |
|---------|---------|------|
| `PostizService` | Postiz API client | `api/server/services/PostizService.js` |
| `N8nToolService` | n8n workflow execution | `api/server/services/N8nToolService.js` |

### Models

| Model | Purpose | File |
|-------|---------|------|
| `SocialDraft` | Store n8n-generated drafts | `api/models/SocialDraft.js` |
| `SocialAccount` | Store connected social accounts | `api/models/SocialAccount.js` |

## Configuration

### Environment Variables

**LibreChat (`.env`):**
```env
# n8n Integration
N8N_WEBHOOK_URL=

# Postiz Integration
POSTIZ_API_URL=
POSTIZ_API_KEY=your_production_api_key_here

# Feature Flag
VITE_SOCIAL_MEDIA_AUTOMATION=true
```

**Postiz (`postiz-deployment/.env`):**
```env
# Server URLs
MAIN_URL=https://postiz.cloud.jamot.pro
FRONTEND_URL=https://postiz.cloud.jamot.pro
NEXT_PUBLIC_BACKEND_URL=https://postiz.cloud.jamot.pro/api

## Testing the Complete Flow

### Prerequisites:
1. ✅ n8n workflow deployed and accessible
2. ✅ Postiz deployed and running
3. ✅ At least one social account connected (LinkedIn or Twitter)
4. ✅ LibreChat `.env` configured with Postiz API key

### Test Steps:

1. **Create Draft:**
   - Open LibreChat
   - Click "Start Social Draft" in sidebar
   - Enter: "Excited to announce our new feature!"
   - Click "Generate drafts"
   - Wait for n8n to generate drafts

2. **Review Draft:**
   - See draft appear in "Pending drafts" section
   - Click "View" to see full content
   - Verify all platforms have content

3. **Approve Draft:**
   - Click "Approve" button
   - Draft status changes to "approved"
   - PostComposer opens automatically

4. **Edit & Post:**
   - See draft content pre-filled
   - Edit if needed
   - Select LinkedIn checkbox
   - Verify character counter shows "2,977 remaining"
   - Click "Post Now"

5. **Verify Success:**
   - See "Post published successfully!" toast
   - Modal closes after 2 seconds
   - Check LinkedIn profile for post

## Current Status

### ✅ Complete (Phases A-C + D1-D2):
- n8n workflow integration
- Draft generation and storage
- Human-in-the-loop approval
- Social account connection (OAuth)
- PostComposer UI
- Postiz API integration
- End-to-end posting flow

### ⏳ Pending:
- Connect Twitter/X account (OAuth issues being resolved)
- Test with real social accounts
- Add post history/analytics (Phase D4)

## Troubleshooting

### Draft not appearing after generation?
- Check n8n workflow logs
- Verify `N8N_WEBHOOK_URL` is correct
- Check MongoDB for saved draft

### PostComposer not opening after approval?
- Check browser console for errors
- Verify `VITE_SOCIAL_MEDIA_AUTOMATION=true`
- Restart frontend: `npm run frontend:dev`

### "No social accounts connected" error?
- Go to Settings → Social Accounts
- Connect at least one platform
- Verify OAuth callback URLs are configured

### Post fails to publish?
- Check Postiz is running: `docker ps | grep postiz`
- Verify `POSTIZ_API_KEY` is correct
- Check Postiz logs: `docker logs postiz --tail 100`
- Verify social account is still connected in Postiz

## Next Steps

1. **Resolve Twitter OAuth** - Fix callback URL configuration
2. **Test End-to-End** - Complete flow with real accounts
3. **Add Post History** - View previously published posts
4. **Add Analytics** - Show engagement metrics from Postiz
5. **Add Scheduling** - Schedule posts for later (Phase D4)

---

**Status:** Integration complete, ready for testing with connected social accounts.
