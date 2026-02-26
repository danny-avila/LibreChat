# Phase D2: User Account Connection Flow - Implementation Plan

**Started:** 2026-02-23  
**Status:** 🔄 IN PROGRESS  
**Goal:** Allow LibreChat users to connect their social media accounts via Postiz

---

## Overview

This phase implements the infrastructure for users to connect their personal social media accounts (LinkedIn, X, Instagram) through Postiz OAuth, storing the connection details in LibreChat's database.

---

## Architecture

```
LibreChat User
    ↓
Settings Page → "Connect LinkedIn" button
    ↓
LibreChat Backend → /api/social/connect/linkedin
    ↓
Postiz OAuth Flow (user authorizes)
    ↓
Postiz returns integration ID
    ↓
LibreChat saves to MongoDB (SocialAccount model)
    ↓
User sees "Connected ✓" in settings
```

---

## Implementation Steps

### Step 1: Database Model (MongoDB)
**File:** `api/models/SocialAccount.js`

```javascript
{
  userId: String,              // LibreChat user ID
  platform: String,            // 'linkedin', 'x', 'instagram'
  postizIntegrationId: String, // Postiz integration ID
  accountName: String,         // Display name (e.g., "@username")
  accountId: String,           // Platform account ID
  isActive: Boolean,           // Connection status
  connectedAt: Date,
  lastUsed: Date,
  metadata: Object             // Platform-specific data
}
```

### Step 2: Backend Service
**File:** `api/server/services/PostizService.js`

Functions:
- `getIntegrations(userId)` - List user's connected accounts
- `connectAccount(userId, platform, callbackUrl)` - Initiate OAuth
- `handleCallback(userId, platform, code)` - Complete OAuth
- `disconnectAccount(userId, integrationId)` - Remove connection
- `getAccountStatus(userId, platform)` - Check if connected

### Step 3: Backend Routes
**File:** `api/server/routes/social.js`

Routes:
- `GET /api/social/accounts` - List user's connected accounts
- `POST /api/social/connect/:platform` - Start OAuth flow
- `GET /api/social/callback/:platform` - OAuth callback handler
- `DELETE /api/social/accounts/:id` - Disconnect account
- `GET /api/social/status` - Get connection status for all platforms

### Step 4: Frontend Hook
**File:** `client/src/hooks/useSocialAccounts.ts`

Functions:
- `useConnectedAccounts()` - Fetch user's accounts
- `connectAccount(platform)` - Trigger OAuth
- `disconnectAccount(id)` - Remove connection
- `refreshAccounts()` - Reload account list

### Step 5: Frontend UI Component
**File:** `client/src/components/Profile/Settings/SocialAccountsSettings.tsx`

Features:
- List of platforms (LinkedIn, X, Instagram)
- "Connect" button for each platform
- Connected status with account name
- "Disconnect" button for connected accounts
- Loading states
- Error handling

### Step 6: Settings Integration
**File:** `client/src/components/Profile/Settings/Settings.tsx`

Add "Social Accounts" tab to settings page

---

## Detailed Implementation

### 1. Create Database Model

**File:** `api/models/SocialAccount.js`

```javascript
const mongoose = require('mongoose');

const socialAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['linkedin', 'x', 'instagram', 'facebook', 'tiktok'],
    },
    postizIntegrationId: {
      type: String,
      required: true,
      unique: true,
    },
    accountName: {
      type: String,
      required: true,
    },
    accountId: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    lastUsed: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for user + platform (one account per platform per user)
socialAccountSchema.index({ userId: 1, platform: 1 }, { unique: true });

module.exports = mongoose.model('SocialAccount', socialAccountSchema);
```

### 2. Create Postiz Service

**File:** `api/server/services/PostizService.js`

```javascript
const axios = require('axios');
const logger = require('~/config/winston');

class PostizService {
  constructor() {
    this.baseURL = process.env.POSTIZ_API_URL || 'http://localhost:4007/api';
    this.apiKey = process.env.POSTIZ_API_KEY;
  }

  // Create axios instance with auth
  getClient() {
    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // Get user's integrations from Postiz
  async getIntegrations() {
    try {
      const client = this.getClient();
      const response = await client.get('/integrations/list');
      return response.data;
    } catch (error) {
      logger.error('[PostizService] Failed to get integrations:', error);
      throw error;
    }
  }

  // Initiate OAuth connection for a platform
  async initiateConnection(platform, callbackUrl) {
    try {
      const client = this.getClient();
      const response = await client.post(`/integrations/social-connect/${platform}`, {
        callbackUrl,
      });
      return response.data;
    } catch (error) {
      logger.error(`[PostizService] Failed to initiate ${platform} connection:`, error);
      throw error;
    }
  }

  // Get integration details
  async getIntegration(integrationId) {
    try {
      const client = this.getClient();
      const response = await client.get(`/integrations/${integrationId}`);
      return response.data;
    } catch (error) {
      logger.error('[PostizService] Failed to get integration:', error);
      throw error;
    }
  }

  // Disconnect integration
  async disconnectIntegration(integrationId) {
    try {
      const client = this.getClient();
      await client.delete('/integrations', {
        data: { id: integrationId },
      });
      return true;
    } catch (error) {
      logger.error('[PostizService] Failed to disconnect integration:', error);
      throw error;
    }
  }

  // Create a post (for Phase D3)
  async createPost(postData) {
    try {
      const client = this.getClient();
      const response = await client.post('/posts', postData);
      return response.data;
    } catch (error) {
      logger.error('[PostizService] Failed to create post:', error);
      throw error;
    }
  }
}

module.exports = new PostizService();
```

### 3. Create Backend Routes

**File:** `api/server/routes/social.js`

```javascript
const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const SocialAccount = require('~/models/SocialAccount');
const PostizService = require('../services/PostizService');
const logger = require('~/config/winston');

// Get user's connected social accounts
router.get('/accounts', requireJwtAuth, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({
      userId: req.user.id,
      isActive: true,
    }).select('-__v');

    res.json({ accounts });
  } catch (error) {
    logger.error('[Social] Failed to get accounts:', error);
    res.status(500).json({ error: 'Failed to fetch social accounts' });
  }
});

// Initiate OAuth connection for a platform
router.post('/connect/:platform', requireJwtAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const callbackUrl = `${process.env.DOMAIN_SERVER}/api/social/callback/${platform}`;

    // Check if user already has this platform connected
    const existing = await SocialAccount.findOne({
      userId: req.user.id,
      platform,
      isActive: true,
    });

    if (existing) {
      return res.status(400).json({ error: 'Platform already connected' });
    }

    // Initiate OAuth with Postiz
    const oauthData = await PostizService.initiateConnection(platform, callbackUrl);

    // Return OAuth URL for frontend to redirect
    res.json({
      oauthUrl: oauthData.url,
      platform,
    });
  } catch (error) {
    logger.error('[Social] Failed to initiate connection:', error);
    res.status(500).json({ error: 'Failed to initiate connection' });
  }
});

// OAuth callback handler
router.get('/callback/:platform', requireJwtAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state, integration_id } = req.query;

    if (!integration_id) {
      return res.redirect(`${process.env.DOMAIN_CLIENT}/settings?error=oauth_failed`);
    }

    // Get integration details from Postiz
    const integration = await PostizService.getIntegration(integration_id);

    // Save to database
    await SocialAccount.findOneAndUpdate(
      { userId: req.user.id, platform },
      {
        userId: req.user.id,
        platform,
        postizIntegrationId: integration_id,
        accountName: integration.name || integration.identifier,
        accountId: integration.internalId,
        isActive: true,
        metadata: {
          type: integration.type,
          picture: integration.picture,
        },
      },
      { upsert: true, new: true }
    );

    // Redirect back to settings with success
    res.redirect(`${process.env.DOMAIN_CLIENT}/settings?tab=social&success=true`);
  } catch (error) {
    logger.error('[Social] OAuth callback failed:', error);
    res.redirect(`${process.env.DOMAIN_CLIENT}/settings?tab=social&error=connection_failed`);
  }
});

// Disconnect a social account
router.delete('/accounts/:id', requireJwtAuth, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({
      _id: req.params.id,
      userId: req.user.id,
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Disconnect from Postiz
    await PostizService.disconnectIntegration(account.postizIntegrationId);

    // Mark as inactive in our database
    account.isActive = false;
    await account.save();

    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    logger.error('[Social] Failed to disconnect account:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

// Get connection status for all platforms
router.get('/status', requireJwtAuth, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({
      userId: req.user.id,
      isActive: true,
    });

    const status = {
      linkedin: accounts.find(a => a.platform === 'linkedin') || null,
      x: accounts.find(a => a.platform === 'x') || null,
      instagram: accounts.find(a => a.platform === 'instagram') || null,
    };

    res.json({ status });
  } catch (error) {
    logger.error('[Social] Failed to get status:', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

module.exports = router;
```

---

## Testing Plan

### Manual Testing
1. Navigate to Settings → Social Accounts
2. Click "Connect LinkedIn"
3. Complete OAuth flow
4. Verify account appears as connected
5. Click "Disconnect"
6. Verify account is removed

### API Testing
```bash
# Get connected accounts
curl -X GET http://localhost:3090/api/social/accounts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get connection status
curl -X GET http://localhost:3090/api/social/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Next Steps

1. ✅ Create database model
2. ✅ Create Postiz service
3. ✅ Create backend routes
4. ⏳ Register routes in server
5. ⏳ Create frontend hook
6. ⏳ Create UI component
7. ⏳ Integrate into settings
8. ⏳ Test OAuth flow

---

*Phase D2 started: 2026-02-23*
