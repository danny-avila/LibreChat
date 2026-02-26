# Postiz Integration Plan - Social Media Automation

**Goal:** Integrate Postiz as the posting layer for approved social media drafts, replacing direct API calls to individual platforms.

**Benefits:**
- Single integration point instead of managing LinkedIn, X, Instagram APIs separately
- Built-in scheduling and queue management
- Analytics and post performance tracking
- Multi-account support per user
- Rate limiting and error handling built-in
- Team collaboration features

---

## 1. Architecture Overview

### Current Flow (Phase C Complete)
```
User → LibreChat (Submit Idea)
  ↓
n8n (Generate Drafts)
  ↓
LibreChat Backend (Save Draft + resumeUrl)
  ↓
User (View/Approve in UI)
  ↓
LibreChat Backend (Call resumeUrl)
  ↓
n8n (Resume → Branch on Approval)
  ↓
[MISSING] Post to Social Platforms
```

### Proposed Flow (With Postiz)
```
User → LibreChat (Submit Idea)
  ↓
n8n (Generate Drafts)
  ↓
LibreChat Backend (Save Draft + resumeUrl)
  ↓
User (View/Approve in UI)
  ↓
LibreChat Backend (Call resumeUrl)
  ↓
n8n (Resume → Branch on Approval)
  ↓
n8n → Postiz API (Create Posts)
  ↓
Postiz → Social Platforms (LinkedIn, X, Instagram, etc.)
```

---

## 2. Postiz Deployment Options

### Option A: Self-Hosted (Recommended for Enterprise)
**Pros:**
- Full control over data
- No per-user costs
- Customizable
- Can run on your infrastructure

**Cons:**
- Need to manage deployment
- Maintenance overhead

**Requirements:**
- Docker/Docker Compose
- PostgreSQL database
- Redis (for queues)
- Domain with SSL

### Option B: Postiz Cloud
**Pros:**
- No infrastructure management
- Always up-to-date
- Official support

**Cons:**
- Subscription costs per user/account
- Less control over data

**Recommendation:** Start with **Option A (Self-Hosted)** for full control and no per-user costs.

---

## 3. Implementation Phases

### Phase D1: Postiz Setup & Configuration

| Step | Task | Details |
|------|------|---------|
| D1.1 | **Deploy Postiz** | Self-host using Docker Compose or use cloud instance |
| D1.2 | **Configure Postiz** | Set up admin account, configure social platform integrations |
| D1.3 | **Get API Credentials** | Generate Postiz API key for LibreChat/n8n integration |
| D1.4 | **Test Postiz** | Manually create a post via Postiz UI to verify platform connections |
| D1.5 | **Document Postiz API** | Review Postiz API docs, identify endpoints for creating posts |

### Phase D2: User Account Connection (Per-User Flow)

| Step | Task | Details |
|------|------|---------|
| D2.1 | **Design User Flow** | Users connect their social accounts in LibreChat → stored in Postiz |
| D2.2 | **Postiz Account Mapping** | Map LibreChat `userId` to Postiz workspace/account |
| D2.3 | **OAuth Proxy** | LibreChat proxies OAuth flow to Postiz for account connection |
| D2.4 | **UI: Connected Accounts** | Settings page showing connected platforms (LinkedIn, X, Instagram) |
| D2.5 | **Store Postiz Account IDs** | Save Postiz account IDs per user in MongoDB |

### Phase D3: n8n → Postiz Integration

| Step | Task | Details |
|------|------|---------|
| D3.1 | **Add Postiz Credentials in n8n** | Configure Postiz API key in n8n credentials |
| D3.2 | **Create Post Node** | HTTP Request node to Postiz API after approval branch |
| D3.3 | **Map Draft to Postiz Format** | Transform LibreChat drafts to Postiz post format |
| D3.4 | **Handle Selected Platforms** | Only post to platforms user selected during approval |
| D3.5 | **Error Handling** | Catch Postiz API errors, log, and notify user |

### Phase D4: LibreChat Backend Integration

| Step | Task | Details |
|------|------|---------|
| D4.1 | **Postiz API Client** | Create `api/server/services/postizClient.js` |
| D4.2 | **Account Connection Routes** | `POST /api/social/connect/:platform` to initiate OAuth |
| D4.3 | **Account Status Routes** | `GET /api/social/accounts` to list connected accounts |
| D4.4 | **Disconnect Routes** | `DELETE /api/social/accounts/:id` to remove connection |
| D4.5 | **Webhook Handler** | Receive Postiz webhooks for post status updates |

### Phase D5: Frontend UI

| Step | Task | Details |
|------|------|---------|
| D5.1 | **Settings Page** | Add "Social Accounts" section in user settings |
| D5.2 | **Connect Buttons** | "Connect LinkedIn", "Connect X", "Connect Instagram" buttons |
| D5.3 | **Account Status Display** | Show connected accounts with platform icons |
| D5.4 | **Disconnect Functionality** | Allow users to disconnect accounts |
| D5.5 | **Draft Approval Enhancement** | Show which accounts are connected during approval |

### Phase D6: Testing & Validation

| Step | Task | Details |
|------|------|---------|
| D6.1 | **Unit Tests** | Test Postiz API client functions |
| D6.2 | **Integration Tests** | Test full flow: Idea → Draft → Approve → Post |
| D6.3 | **Multi-User Test** | Verify per-user account isolation |
| D6.4 | **Error Scenarios** | Test rate limits, failed posts, disconnected accounts |
| D6.5 | **Production Validation** | Test with real social accounts in sandbox mode |

---

## 4. Technical Specifications

### 4.1 Postiz API Endpoints (Key Ones)

Based on Postiz API documentation:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/posts` | POST | Create a new post |
| `/api/integrations` | GET | List user's connected accounts |
| `/api/integrations/:platform` | POST | Connect a social account |
| `/api/integrations/:id` | DELETE | Disconnect account |
| `/api/posts/:id` | GET | Get post status |
| `/api/posts/:id` | DELETE | Delete scheduled post |

### 4.2 Postiz Post Format

```json
{
  "content": "Post text content",
  "integrations": ["integration_id_1", "integration_id_2"],
  "schedule": "2024-01-20T10:00:00Z",  // Optional: immediate if omitted
  "media": [],  // Optional: for images/videos
  "settings": {
    "linkedin": {
      "visibility": "PUBLIC"
    },
    "twitter": {
      "reply_settings": "everyone"
    }
  }
}
```

### 4.3 LibreChat Data Model Updates

**New Model: `SocialAccount.js`**
```javascript
{
  userId: String,           // LibreChat user ID
  platform: String,         // 'linkedin', 'x', 'instagram', etc.
  postizIntegrationId: String,  // Postiz integration ID
  accountName: String,      // Display name (e.g., "@username")
  accountId: String,        // Platform account ID
  isActive: Boolean,
  connectedAt: Date,
  lastUsed: Date
}
```

**Update: `SocialDraft.js`**
```javascript
// Add field:
postizPostIds: [String],  // Postiz post IDs after posting
postStatus: String,       // 'pending', 'posted', 'failed'
postedAt: Date
```

### 4.4 Environment Variables

```env
# Postiz Configuration
POSTIZ_API_URL=https://your-postiz-instance.com/api
POSTIZ_API_KEY=your-postiz-api-key
POSTIZ_WEBHOOK_SECRET=your-webhook-secret

# Optional: Postiz OAuth (if using Postiz-managed OAuth)
POSTIZ_CLIENT_ID=your-client-id
POSTIZ_CLIENT_SECRET=your-client-secret
```

---

## 5. User Experience Flow

### 5.1 First-Time Setup (Per User)

1. User goes to Settings → Social Accounts
2. Sees "Connect your social accounts to post automatically"
3. Clicks "Connect LinkedIn"
4. OAuth flow (via Postiz):
   - Redirects to LinkedIn
   - User authorizes
   - Redirects back to LibreChat
   - Account saved in Postiz + LibreChat DB
5. Repeat for X, Instagram, etc.

### 5.2 Creating & Approving Drafts

1. User submits idea via `/social-draft` command or modal
2. n8n generates drafts for all platforms
3. User sees drafts in approval modal
4. User selects which platforms to post to (only shows connected accounts)
5. User clicks "Approve & Post"
6. n8n receives approval → calls Postiz API
7. Postiz posts to selected platforms
8. User sees success notification with links to posts

### 5.3 Viewing Post Status

1. User goes to sidebar → "Social Drafts"
2. Sees list with status:
   - ✅ Posted (with links to actual posts)
   - ⏳ Scheduled
   - ❌ Failed (with error message)
3. Can click to view post details or retry failed posts

---

## 6. n8n Workflow Changes

### Current Workflow (Phase C)
```
Webhook (Trigger)
  ↓
Prepare Data
  ↓
LLM (Generate Drafts)
  ↓
Code (Format Drafts)
  ↓
HTTP Request (Save to LibreChat)
  ↓
Wait (Pause for Approval)
  ↓
If (Approved?)
  ├─ True → [PLACEHOLDER]
  └─ False → End
```

### Updated Workflow (With Postiz)
```
Webhook (Trigger)
  ↓
Prepare Data
  ↓
LLM (Generate Drafts)
  ↓
Code (Format Drafts)
  ↓
HTTP Request (Save to LibreChat)
  ↓
Wait (Pause for Approval)
  ↓
If (Approved?)
  ├─ True → Get User's Postiz Accounts (HTTP Request to LibreChat)
  │           ↓
  │         Code (Map Platforms to Postiz Integration IDs)
  │           ↓
  │         HTTP Request (POST to Postiz API)
  │           ↓
  │         HTTP Request (Update Draft Status in LibreChat)
  │           ↓
  │         End (Success)
  │
  └─ False → End (Rejected)
```

---

## 7. Security Considerations

| Concern | Mitigation |
|---------|------------|
| **API Key Exposure** | Store Postiz API key in environment variables, never in code |
| **User Token Security** | Postiz manages OAuth tokens; LibreChat only stores integration IDs |
| **Webhook Verification** | Validate Postiz webhook signatures using `POSTIZ_WEBHOOK_SECRET` |
| **Rate Limiting** | Postiz handles platform rate limits; add application-level limits |
| **Account Isolation** | Ensure users can only post to their own connected accounts |

---

## 8. Rollout Strategy

### Stage 1: Internal Testing (Week 1)
- Deploy Postiz in staging environment
- Connect test social accounts
- Test full flow with 1-2 internal users
- Validate error handling

### Stage 2: Beta Users (Week 2)
- Invite 5-10 beta users
- Collect feedback on UX
- Monitor Postiz performance
- Fix bugs and improve error messages

### Stage 3: General Availability (Week 3)
- Deploy to production
- Enable for all users
- Monitor usage and errors
- Provide user documentation

---

## 9. Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Account Connection Rate** | >70% of users connect at least 1 account | Track `SocialAccount` records |
| **Post Success Rate** | >95% of approved drafts post successfully | Track `postStatus` in `SocialDraft` |
| **Time to Post** | <30 seconds from approval to posted | Log timestamps |
| **User Satisfaction** | >4/5 rating | User feedback surveys |
| **Error Rate** | <5% of posts fail | Monitor Postiz API errors |

---

## 10. Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Postiz Downtime** | High | Low | Implement retry logic, queue failed posts |
| **OAuth Flow Breaks** | High | Medium | Provide clear error messages, fallback to manual connection |
| **Rate Limits Hit** | Medium | Medium | Postiz handles this; add user notifications |
| **User Confusion** | Medium | High | Clear onboarding, tooltips, documentation |
| **Cost Overruns** | Low | Low | Self-hosted = no per-user costs |

---

## 11. Documentation Needed

1. **User Guide**: "How to Connect Your Social Accounts"
2. **Developer Guide**: "Postiz Integration Architecture"
3. **API Reference**: "LibreChat ↔ Postiz API Endpoints"
4. **Troubleshooting**: "Common Issues and Solutions"
5. **Admin Guide**: "Deploying and Managing Postiz"

---

## 12. Open Questions (To Decide)

1. **Postiz Deployment**: Self-hosted or cloud? (Recommend: Self-hosted)
2. **Scheduling**: Allow users to schedule posts or always post immediately? (Recommend: Immediate for v1, scheduling in v2)
3. **Media Support**: Support images/videos in drafts? (Recommend: Text-only for v1)
4. **Multi-Account**: Allow users to connect multiple accounts per platform? (Recommend: Yes, Postiz supports this)
5. **Analytics**: Show post analytics from Postiz in LibreChat? (Recommend: v2 feature)

---

## 13. Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| D1: Postiz Setup | 2-3 days | Infrastructure access |
| D2: User Account Connection | 3-4 days | Postiz API docs |
| D3: n8n Integration | 2-3 days | D1 complete |
| D4: Backend Integration | 3-4 days | D1 complete |
| D5: Frontend UI | 3-4 days | D4 complete |
| D6: Testing | 2-3 days | All phases complete |
| **Total** | **15-21 days** | |

---

## 14. Next Steps (After Approval)

1. **Immediate**: Deploy Postiz instance (self-hosted or cloud)
2. **Day 1**: Configure Postiz, connect test social accounts
3. **Day 2**: Review Postiz API documentation, test API calls
4. **Day 3**: Start D2.1 - Design user account connection flow
5. **Week 1**: Complete D1-D3 (Postiz setup + n8n integration)
6. **Week 2**: Complete D4-D5 (Backend + Frontend)
7. **Week 3**: Testing and rollout

---

## 15. Alternative: Direct API vs Postiz

| Aspect | Direct API (D1-D4 Original) | Postiz Integration |
|--------|----------------------------|-------------------|
| **Complexity** | High (3 separate OAuth flows) | Medium (1 integration) |
| **Maintenance** | High (track API changes per platform) | Low (Postiz handles updates) |
| **Features** | Basic posting only | Scheduling, analytics, queues |
| **Cost** | Free (just API usage) | Free (self-hosted) or subscription |
| **Time to Implement** | 3-4 weeks | 2-3 weeks |
| **Scalability** | Manual (add platforms one by one) | Easy (Postiz adds platforms) |
| **Recommendation** | ❌ More work, less features | ✅ Better long-term solution |

---

## 16. Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| D1: Postiz Setup | ✅ COMPLETE | Deployed successfully, API keys generated |
| D2: User Account Connection | 🔄 READY TO START | Prerequisites met |
| D3: n8n Integration | ⏳ PENDING | Awaiting D2 completion |
| D4: Backend Integration | ⏳ PENDING | Awaiting D2 completion |
| D5: Frontend UI | ⏳ PENDING | Awaiting D4 completion |
| D6: Testing | ⏳ PENDING | Awaiting all phases |

### Decisions Made
- ✅ Deployment: Self-hosted (Docker)
- ✅ Posting: Immediate only (v1)
- ✅ Media: Text-only (v1)
- ✅ Scheduling: Future enhancement (v2)
- ✅ Images/Videos: Future enhancement (v2)

### Phase D1 Completion Summary
- Postiz deployed at http://localhost:4007
- Admin account created
- API keys generated and saved in .env
- Social account connections deferred to Phase D3
- Ready to start Phase D2

---

*Last updated: 2026-02-23*
*Status: D1 COMPLETE - Ready for D2*
*Next: Design and implement user account connection flow*
