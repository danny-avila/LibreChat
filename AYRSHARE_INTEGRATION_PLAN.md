# Ayrshare Integration Plan for LibreChat

## Executive Summary

**Decision: ✅ Ayrshare WILL work for your use case**

After thorough research, Ayrshare meets all your requirements:

### ✅ Requirement 1: LinkedIn Full Engagement
- **Create posts**: ✅ Supported
- **Reply/comment on posts**: ✅ Supported via Comments API
- **Reply to comments under a post**: ✅ Supported (nested comments)

### ✅ Requirement 2: Other Platforms (Facebook, Twitter, Instagram)
- **Upload posts**: ✅ Supported for all platforms
- **Future engagement features**: ✅ Available when needed

### ✅ Requirement 3: Per-User Social Accounts
- **Multi-user architecture**: ✅ Built-in via Business Plan
- **Each user connects their own accounts**: ✅ Profile Key system
- **Secure isolation**: ✅ Profile-based scoping

---

## Ayrshare Capabilities Verification

### LinkedIn Features (Your Priority)
| Feature | Status | API Endpoint |
|---------|--------|--------------|
| Create post | ✅ Supported | `POST /api/post` |
| Comment on post | ✅ Supported | `POST /api/comments` |
| Reply to comment | ✅ Supported | `POST /api/comments` (with commentId) |
| Get comments | ✅ Supported | `GET /api/comments/{postId}` |
| Get comment replies | ✅ Supported | `GET /api/comments/{commentId}?commentId=true` |
| Delete comment | ✅ Supported | `DELETE /api/comments/{commentId}` |

### Other Platforms
| Platform | Post | Comment | Reply | Status |
|----------|------|---------|-------|--------|
| Facebook | ✅ | ✅ | ✅ | Fully supported |
| X/Twitter | ✅ | ✅ | ✅ | Fully supported |
| Instagram | ✅ | ✅ | ✅ | Fully supported |
| TikTok | ✅ | ✅ | ✅ | Fully supported |
| YouTube | ✅ | ✅ | ✅ | Fully supported |
| Reddit | ✅ | ✅ | ✅ | Fully supported |
| Threads | ✅ | ✅ | ✅ | Fully supported |
| Bluesky | ✅ | ✅ | ✅ | Fully supported |

---

## Pricing & Plan Requirements

### Business Plan (Required for Multi-User)

- **What you need**: Business Plan (contact Ayrshare sales)
- **Why**: Enables per-user profiles and multi-user management
- **Estimated cost**: Custom pricing (typically starts around $149-299/month based on usage)
- **What's included**:
  - Unlimited user profiles
  - Per-user social account connections
  - Full API access
  - Comments & engagement features
  - Analytics
  - Priority support

### Cost Comparison
- **Postiz**: Self-hosted (free) but 2+ weeks of integration issues
- **Ayrshare**: Paid service but proven, documented, and designed for your use case
- **ROI**: Faster time-to-market, less maintenance, more features

---

## Architecture Overview

### Current System (What Stays)
```
User → LibreChat (Submit Idea)
  ↓
n8n (Generate Drafts via AI)
  ↓
LibreChat Backend (Save SocialDraft + resumeUrl)
  ↓
User (View/Approve in UI)
  ↓
LibreChat Backend (Call resumeUrl)
  ↓
n8n (Resume → Branch on Approval)
```

### New System (With Ayrshare)
```
User → LibreChat (Submit Idea)
  ↓
n8n (Generate Drafts via AI)
  ↓
LibreChat Backend (Save SocialDraft + resumeUrl)
  ↓
User (View/Approve in UI)
  ↓
LibreChat Backend (Call resumeUrl)
  ↓
n8n (Resume → Branch on Approval)
  ↓
n8n → Ayrshare API (Create Posts)
  ↓
Ayrshare → Social Platforms (LinkedIn, Facebook, X, etc.)
```

### Per-User Account Connection Flow
```
1. User clicks "Connect LinkedIn" in LibreChat Settings
   ↓
2. LibreChat Backend → Ayrshare API (Create Profile if new)
   ↓
3. LibreChat Backend → Ayrshare API (Generate JWT Connect URL)
   ↓
4. User redirected to Ayrshare's secure connection page
   ↓
5. User authorizes LinkedIn (OAuth handled by Ayrshare)
   ↓
6. User redirected back to LibreChat
   ↓
7. LibreChat stores user's Ayrshare Profile Key
   ↓
8. User can now post to their LinkedIn from LibreChat
```

---

## Implementation Phases

### Phase 1: Ayrshare Setup & Account Creation (Days 1-2)

**1.1 Sign Up for Ayrshare Business Plan**

- Action: Contact Ayrshare sales (https://www.ayrshare.com/pricing)
- Request: Business Plan for multi-user platform
- Provide: Brief description of LibreChat use case
- Receive: API Key, domain configuration, integration package

**1.2 Configure Environment Variables**
```env
# Add to .env
AYRSHARE_API_KEY=your_primary_api_key_here
AYRSHARE_API_URL=https://api.ayrshare.com/api
AYRSHARE_DOMAIN=your_domain_id_here
```

**1.3 Test API Access**
```bash
curl -X GET https://api.ayrshare.com/api/user \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected response: Your account details

---

### Phase 2: Backend Integration (Days 3-5)

**2.1 Create Ayrshare Service**

Create `api/server/services/AyrshareService.js`:

```javascript
const axios = require('axios');
const logger = require('~/config/winston');

class AyrshareService {
  constructor() {
    this.baseURL = process.env.AYRSHARE_API_URL || 'https://api.ayrshare.com/api';
    this.apiKey = process.env.AYRSHARE_API_KEY;
    
    if (!this.apiKey) {
      logger.warn('[AyrshareService] AYRSHARE_API_KEY not configured');
    }
  }

  getClient(profileKey = null) {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    
    if (profileKey) {
      headers['Profile-Key'] = profileKey;
    }
    
    return axios.create({
      baseURL: this.baseURL,
      headers,
      timeout: 30000,
    });
  }

  // Create user profile
  async createProfile(userId, profileName) {
    try {
      const client = this.getClient();
      const response = await client.post('/profiles', {
        profileName: profileName || `user_${userId}`,
      });
      
      logger.info(`[Ayrshare] Profile created for user ${userId}`);
      return response.data;
    } catch (error) {
      logger.error('[Ayrshare] Failed to create profile:', error.message);
      throw new Error('Failed to create Ayrshare profile');
    }
  }

  // Generate connect URL for user to link social accounts
  async getConnectUrl(profileKey, redirectUrl) {
    try {
      const client = this.getClient();
      const response = await client.post('/connect', {
        profileKey,
        redirectUrl: redirectUrl || `${process.env.DOMAIN_CLIENT}/settings?tab=social&success=connected`,
      });
      
      return response.data.url;
    } catch (error) {
      logger.error('[Ayrshare] Failed to generate connect URL:', error.message);
      throw new Error('Failed to generate connect URL');
    }
  }

  // Get user's connected platforms
  async getConnectedPlatforms(profileKey) {
    try {
      const client = this.getClient(profileKey);
      const response = await client.get('/user');
      return response.data.connected || [];
    } catch (error) {
      logger.error('[Ayrshare] Failed to get connected platforms:', error.message);
      throw new Error('Failed to get connected platforms');
    }
  }

  // Create post
  async createPost(profileKey, postData) {
    try {
      const client = this.getClient(profileKey);
      const response = await client.post('/post', postData);
      
      logger.info(`[Ayrshare] Post created for profile ${profileKey}`);
      return response.data;
    } catch (error) {
      logger.error('[Ayrshare] Failed to create post:', error.message);
      throw new Error('Failed to create post');
    }
  }

  // Post comment on a post
  async postComment(profileKey, postId, comment, platforms) {
    try {
      const client = this.getClient(profileKey);
      const response = await client.post('/comments', {
        id: postId,
        comment,
        platforms,
      });
      
      logger.info(`[Ayrshare] Comment posted for profile ${profileKey}`);
      return response.data;
    } catch (error) {
      logger.error('[Ayrshare] Failed to post comment:', error.message);
      throw new Error('Failed to post comment');
    }
  }

  // Get comments on a post
  async getComments(profileKey, postId, platform) {
    try {
      const client = this.getClient(profileKey);
      const response = await client.get(`/comments/${postId}`, {
        params: { platform },
      });
      
      return response.data;
    } catch (error) {
      logger.error('[Ayrshare] Failed to get comments:', error.message);
      throw new Error('Failed to get comments');
    }
  }

  // Reply to a comment
  async replyToComment(profileKey, commentId, reply, platform) {
    try {
      const client = this.getClient(profileKey);
      const response = await client.post('/comments', {
        id: commentId,
        comment: reply,
        platforms: [platform],
        searchPlatformId: true,
        commentId: true,
      });
      
      logger.info(`[Ayrshare] Reply posted for profile ${profileKey}`);
      return response.data;
    } catch (error) {
      logger.error('[Ayrshare] Failed to reply to comment:', error.message);
      throw new Error('Failed to reply to comment');
    }
  }

  // Delete profile
  async deleteProfile(profileKey) {
    try {
      const client = this.getClient(profileKey);
      await client.delete('/profiles');
      
      logger.info(`[Ayrshare] Profile deleted: ${profileKey}`);
      return true;
    } catch (error) {
      logger.error('[Ayrshare] Failed to delete profile:', error.message);
      throw new Error('Failed to delete profile');
    }
  }
}

module.exports = new AyrshareService();
```

**2.2 Update Database Models**

Update `api/models/SocialAccount.js`:

```javascript
const mongoose = require('mongoose');

const socialAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    // Ayrshare Profile Key (one per user)
    ayrshareProfileKey: {
      type: String,
      required: true,
      unique: true,
    },
    // Connected platforms
    connectedPlatforms: [{
      platform: String, // 'linkedin', 'facebook', 'twitter', etc.
      accountName: String,
      connectedAt: Date,
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

socialAccountSchema.index({ userId: 1 }, { unique: true });
socialAccountSchema.index({ ayrshareProfileKey: 1 });

const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

module.exports = SocialAccount;
```

**2.3 Update Social Routes**

Update `api/server/routes/social.js`:

```javascript
const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const SocialAccount = require('~/models/SocialAccount');
const AyrshareService = require('../services/AyrshareService');
const logger = require('~/config/winston');

/**
 * GET /api/social/accounts
 * Get user's connected social accounts
 */
router.get('/accounts', requireJwtAuth, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({
      userId: req.user.id,
      isActive: true,
    });

    if (!account) {
      return res.json({ accounts: [], connected: false });
    }

    // Get fresh connection status from Ayrshare
    try {
      const platforms = await AyrshareService.getConnectedPlatforms(account.ayrshareProfileKey);
      
      // Update our DB with latest platforms
      account.connectedPlatforms = platforms.map(p => ({
        platform: p,
        accountName: p,
        connectedAt: new Date(),
      }));
      await account.save();
    } catch (err) {
      logger.warn('[Social] Could not fetch latest platforms from Ayrshare:', err.message);
    }

    res.json({
      accounts: account.connectedPlatforms,
      connected: account.connectedPlatforms.length > 0,
      profileKey: account.ayrshareProfileKey,
    });
  } catch (error) {
    logger.error('[Social] Failed to get accounts:', error);
    res.status(500).json({ error: 'Failed to fetch social accounts' });
  }
});

/**
 * POST /api/social/connect
 * Get Ayrshare connect URL for user to link their social accounts
 */
router.post('/connect', requireJwtAuth, async (req, res) => {
  try {
    let account = await SocialAccount.findOne({ userId: req.user.id });

    // Create Ayrshare profile if user doesn't have one
    if (!account) {
      const profileData = await AyrshareService.createProfile(
        req.user.id,
        `user_${req.user.id}_${Date.now()}`
      );

      account = await SocialAccount.create({
        userId: req.user.id,
        ayrshareProfileKey: profileData.profileKey,
        connectedPlatforms: [],
        isActive: true,
      });

      logger.info(`[Social] Created Ayrshare profile for user ${req.user.id}`);
    }

    // Generate connect URL
    const connectUrl = await AyrshareService.getConnectUrl(account.ayrshareProfileKey);

    res.json({
      connectUrl,
      message: 'Open this URL to connect your social accounts',
    });
  } catch (error) {
    logger.error('[Social] Failed to initiate connection:', error);
    res.status(500).json({
      error: 'Failed to initiate connection',
      message: error.message,
    });
  }
});

/**
 * POST /api/social/posts
 * Create a post on selected social media platforms
 */
router.post('/posts', requireJwtAuth, async (req, res) => {
  try {
    const { content, platforms, mediaUrls } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const account = await SocialAccount.findOne({
      userId: req.user.id,
      isActive: true,
    });

    if (!account) {
      return res.status(400).json({ error: 'No social accounts connected' });
    }

    const postData = {
      post: content.trim(),
      platforms: platforms || account.connectedPlatforms.map(p => p.platform),
    };

    if (mediaUrls && mediaUrls.length > 0) {
      postData.mediaUrls = mediaUrls;
    }

    const result = await AyrshareService.createPost(account.ayrshareProfileKey, postData);

    logger.info(`[Social] Post created for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Post published successfully',
      post: result,
    });
  } catch (error) {
    logger.error('[Social] Failed to create post:', error);
    res.status(500).json({
      error: 'Failed to create post',
      message: error.message,
    });
  }
});

/**
 * POST /api/social/comments
 * Post a comment on a post
 */
router.post('/comments', requireJwtAuth, async (req, res) => {
  try {
    const { postId, comment, platforms } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment is required' });
    }

    const account = await SocialAccount.findOne({
      userId: req.user.id,
      isActive: true,
    });

    if (!account) {
      return res.status(400).json({ error: 'No social accounts connected' });
    }

    const result = await AyrshareService.postComment(
      account.ayrshareProfileKey,
      postId,
      comment.trim(),
      platforms
    );

    res.json({
      success: true,
      message: 'Comment posted successfully',
      comment: result,
    });
  } catch (error) {
    logger.error('[Social] Failed to post comment:', error);
    res.status(500).json({
      error: 'Failed to post comment',
      message: error.message,
    });
  }
});

/**
 * GET /api/social/comments/:postId
 * Get comments on a post
 */
router.get('/comments/:postId', requireJwtAuth, async (req, res) => {
  try {
    const { postId } = req.params;
    const { platform } = req.query;

    const account = await SocialAccount.findOne({
      userId: req.user.id,
      isActive: true,
    });

    if (!account) {
      return res.status(400).json({ error: 'No social accounts connected' });
    }

    const comments = await AyrshareService.getComments(
      account.ayrshareProfileKey,
      postId,
      platform
    );

    res.json({
      success: true,
      comments,
    });
  } catch (error) {
    logger.error('[Social] Failed to get comments:', error);
    res.status(500).json({
      error: 'Failed to get comments',
      message: error.message,
    });
  }
});

/**
 * POST /api/social/comments/:commentId/reply
 * Reply to a comment
 */
router.post('/comments/:commentId/reply', requireJwtAuth, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { reply, platform } = req.body;

    if (!reply || !reply.trim()) {
      return res.status(400).json({ error: 'Reply is required' });
    }

    if (!platform) {
      return res.status(400).json({ error: 'Platform is required' });
    }

    const account = await SocialAccount.findOne({
      userId: req.user.id,
      isActive: true,
    });

    if (!account) {
      return res.status(400).json({ error: 'No social accounts connected' });
    }

    const result = await AyrshareService.replyToComment(
      account.ayrshareProfileKey,
      commentId,
      reply.trim(),
      platform
    );

    res.json({
      success: true,
      message: 'Reply posted successfully',
      reply: result,
    });
  } catch (error) {
    logger.error('[Social] Failed to reply to comment:', error);
    res.status(500).json({
      error: 'Failed to reply to comment',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/social/disconnect
 * Disconnect user's social accounts (delete Ayrshare profile)
 */
router.delete('/disconnect', requireJwtAuth, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({ userId: req.user.id });

    if (!account) {
      return res.status(404).json({ error: 'No account found' });
    }

    // Delete from Ayrshare
    try {
      await AyrshareService.deleteProfile(account.ayrshareProfileKey);
    } catch (err) {
      logger.warn('[Social] Failed to delete from Ayrshare, continuing:', err.message);
    }

    // Delete from our DB
    await SocialAccount.deleteOne({ userId: req.user.id });

    logger.info(`[Social] Disconnected all accounts for user ${req.user.id}`);

    res.json({
      message: 'All social accounts disconnected successfully',
    });
  } catch (error) {
    logger.error('[Social] Failed to disconnect accounts:', error);
    res.status(500).json({ error: 'Failed to disconnect accounts' });
  }
});

module.exports = router;
```

---

### Phase 3: n8n Integration (Days 6-7)

**3.1 Update n8n Workflow**

In your existing n8n workflow, after the approval branch:

**Node: "Post to Social Media" (HTTP Request)**
- Method: POST
- URL: `https://api.ayrshare.com/api/post`
- Headers:
  - `Authorization`: `Bearer {{$env.AYRSHARE_API_KEY}}`
  - `Profile-Key`: `{{$json.userProfileKey}}` (from LibreChat)
  - `Content-Type`: `application/json`
- Body:
```json
{
  "post": "{{$json.draftContent}}",
  "platforms": {{$json.selectedPlatforms}}
}
```

**3.2 Update LibreChat → n8n Data Flow**

When calling n8n resumeUrl, include user's Ayrshare profile key:

```javascript
// In api/server/routes/socialDrafts.js
const account = await SocialAccount.findOne({ userId: draft.userId });

const resumeUrl = new URL(draft.resumeUrl);
resumeUrl.searchParams.append('userProfileKey', account.ayrshareProfileKey);
resumeUrl.searchParams.append('selectedPlatforms', JSON.stringify(selectedPlatforms));

await axios.get(resumeUrl.toString(), { timeout: 15000 });
```

---

### Phase 4: Frontend UI Updates (Days 8-10)

**4.1 Update Social Accounts Settings**

Update `client/src/components/Profile/Settings/SocialAccountsSettings.tsx`:

```typescript
export default function SocialAccountsSettings() {
  const { showToast } = useToastContext();
  const { token } = useAuthContext();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/social/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch (err) {
      showToast({ message: 'Failed to load accounts', status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/social/connect', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json();
      
      // Open Ayrshare connect page in new window
      const connectWindow = window.open(data.connectUrl, '_blank', 'width=800,height=600');
      
      // Poll for connection completion
      const pollInterval = setInterval(async () => {
        if (connectWindow?.closed) {
          clearInterval(pollInterval);
          await fetchAccounts();
          showToast({ message: 'Check your connected accounts', status: 'success' });
        }
      }, 1000);
    } catch (err) {
      showToast({ message: 'Failed to connect', status: 'error' });
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Social Media Accounts</h3>
      
      {loading ? (
        <p>Loading...</p>
      ) : accounts.length === 0 ? (
        <div className="text-center py-8">
          <p className="mb-4">No social accounts connected</p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="btn btn-primary"
          >
            {connecting ? 'Opening...' : 'Connect Social Accounts'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <div key={account.platform} className="flex items-center justify-between p-3 border rounded">
              <div className="flex items-center gap-2">
                <span className="capitalize">{account.platform}</span>
                <span className="text-sm text-gray-500">({account.accountName})</span>
              </div>
              <span className="text-green-600">✓ Connected</span>
            </div>
          ))}
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="btn btn-secondary mt-4"
          >
            {connecting ? 'Opening...' : 'Add More Accounts'}
          </button>
        </div>
      )}
    </div>
  );
}
```

**4.2 Add LinkedIn Engagement UI**

Create `client/src/components/Social/LinkedInEngagement.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { useAuthContext } from '~/hooks/AuthContext';

export default function LinkedInEngagement({ postId }: { postId: string }) {
  const { token } = useAuthContext();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const fetchComments = async () => {
    const res = await fetch(`/api/social/comments/${postId}?platform=linkedin`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setComments(data.comments || []);
  };

  useEffect(() => {
    fetchComments();
  }, [postId]);

  const handlePostComment = async () => {
    await fetch('/api/social/comments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        postId,
        comment: newComment,
        platforms: ['linkedin'],
      }),
    });
    setNewComment('');
    fetchComments();
  };

  const handleReply = async (commentId: string) => {
    await fetch(`/api/social/comments/${commentId}/reply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reply: replyText,
        platform: 'linkedin',
      }),
    });
    setReplyTo(null);
    setReplyText('');
    fetchComments();
  };

  return (
    <div className="space-y-4">
      <div>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment..."
          className="w-full p-2 border rounded"
        />
        <button onClick={handlePostComment} className="btn btn-primary mt-2">
          Post Comment
        </button>
      </div>

      <div className="space-y-3">
        {comments.map((comment: any) => (
          <div key={comment.id} className="border-l-2 pl-4">
            <p>{comment.text}</p>
            <button
              onClick={() => setReplyTo(comment.id)}
              className="text-sm text-blue-600"
            >
              Reply
            </button>

            {replyTo === comment.id && (
              <div className="mt-2">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a reply..."
                  className="w-full p-2 border rounded"
                />
                <button
                  onClick={() => handleReply(comment.id)}
                  className="btn btn-sm btn-primary mt-1"
                >
                  Send Reply
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

### Phase 5: Testing & Validation (Days 11-12)

**5.1 Unit Tests**

Test Ayrshare service functions:
- Profile creation
- Connect URL generation
- Post creation
- Comment posting
- Reply to comments

**5.2 Integration Tests**

Test full flow:
1. User connects LinkedIn account
2. User submits idea
3. n8n generates drafts
4. User approves draft
5. Post published to LinkedIn
6. User comments on post
7. User replies to comment

**5.3 Multi-User Tests**

- Create 2-3 test users
- Each connects their own LinkedIn
- Verify posts go to correct accounts
- Verify no cross-user data leakage

---

## Phase 6: Postiz Removal (Days 13-14)

### Step-by-Step Postiz Cleanup

**6.1 Backup Current Data**
```bash
# Backup Postiz-related data
mongodump --db=librechat --collection=socialaccounts --out=./backup
mongodump --db=librechat --collection=postizconnections --out=./backup
```

**6.2 Remove Postiz Code**

Files to delete:
- `api/models/PostizConnection.js`
- `api/server/services/PostizService.js`
- `postiz-deployment/` folder

**6.3 Remove Postiz Environment Variables**

From `.env`, remove:
```env
POSTIZ_API_URL
POSTIZ_API_KEY
POSTIZ_PUBLIC_API_URL
POSTIZ_APP_URL
POSTIZ_OAUTH_CLIENT_ID
POSTIZ_OAUTH_CLIENT_SECRET
```

**6.4 Update Database**

```javascript
// Migration script: api/migrations/remove-postiz.js
const mongoose = require('mongoose');
const SocialAccount = require('~/models/SocialAccount');
const PostizConnection = require('~/models/PostizConnection');

async function migrateFromPostiz() {
  // Delete Postiz connections
  await PostizConnection.deleteMany({});
  
  // Remove postizIntegrationId from SocialAccount
  await SocialAccount.updateMany(
    {},
    { $unset: { postizIntegrationId: 1 } }
  );
  
  console.log('Postiz data cleaned up');
}

migrateFromPostiz();
```

**6.5 Update Documentation**

- Remove Postiz references from README
- Update FEATURES.md to reflect Ayrshare
- Archive Postiz integration docs

**6.6 Verify Removal**

```bash
# Search for remaining Postiz references
grep -r "postiz" --exclude-dir=node_modules --exclude-dir=.git .
grep -r "Postiz" --exclude-dir=node_modules --exclude-dir=.git .
```

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Account Connection Rate | >80% | Track SocialAccount records |
| Post Success Rate | >98% | Track Ayrshare API responses |
| Comment/Reply Success | >95% | Track engagement API calls |
| Time to Connect Account | <2 minutes | User feedback |
| Time to Post | <10 seconds | Log timestamps |
| User Satisfaction | >4.5/5 | User surveys |

---

## Cost Analysis

### Ayrshare Business Plan
- **Estimated**: $149-299/month (contact for exact pricing)
- **Includes**: Unlimited user profiles, all platforms, full API access

### Development Time Saved
- **Postiz**: 2+ weeks spent, still not working
- **Ayrshare**: 2 weeks to full production (proven, documented)
- **Savings**: ~2-4 weeks of developer time

### Maintenance
- **Postiz**: Self-hosted, requires updates, debugging
- **Ayrshare**: Managed service, automatic updates, support

### ROI
- Faster time-to-market
- Less maintenance overhead
- More reliable service
- Better user experience

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Ayrshare API downtime | Implement retry logic, queue failed posts |
| Rate limits | Monitor usage, implement backoff |
| User confusion | Clear onboarding, tooltips, help docs |
| Cost overruns | Monitor usage, set alerts |
| Migration issues | Thorough testing, gradual rollout |

---

## Timeline Summary

| Phase | Duration | Status |
|-------|----------|--------|
| 1. Ayrshare Setup | 2 days | ⏳ Pending |
| 2. Backend Integration | 3 days | ⏳ Pending |
| 3. n8n Integration | 2 days | ⏳ Pending |
| 4. Frontend UI | 3 days | ⏳ Pending |
| 5. Testing | 2 days | ⏳ Pending |
| 6. Postiz Removal | 2 days | ⏳ Pending |
| **Total** | **14 days** | |

---

## Next Steps

1. **Immediate**: Contact Ayrshare sales for Business Plan pricing
2. **Day 1**: Sign up, get API key, configure environment
3. **Day 2**: Test API access, create first test profile
4. **Day 3**: Begin backend integration (AyrshareService)
5. **Week 2**: Complete integration, begin testing
6. **Week 3**: Production rollout, remove Postiz

---

## Support & Resources

- **Ayrshare Docs**: https://www.ayrshare.com/docs
- **API Reference**: https://www.ayrshare.com/docs/apis/overview
- **Multi-User Guide**: https://www.ayrshare.com/implementing-multi-user-social-account-linking-with-ayrshare/
- **Comments API**: https://www.ayrshare.com/docs/apis/comments/overview
- **Support**: Contact Ayrshare support team

---

**Document Version**: 1.0  
**Last Updated**: March 10, 2026  
**Status**: Ready for Implementation  
**Approval**: Pending stakeholder review
