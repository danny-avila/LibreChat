const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { requireJwtAuth } = require('../middleware');
const SocialAccount = require('~/models/SocialAccount');
const PostizService = require('../services/PostizService');
const logger = require('~/config/winston');

/**
 * Generate secure OAuth state parameter
 * @param {string} userId - User ID to encode
 * @param {string} platform - Platform name
 * @returns {string} Signed JWT token
 */
function generateOAuthState(userId, platform) {
  const payload = {
    userId,
    platform,
    timestamp: Date.now(),
  };
  
  // Sign with JWT secret, expires in 10 minutes
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '10m' });
}

/**
 * Verify and decode OAuth state parameter
 * @param {string} state - State parameter from OAuth callback
 * @returns {Object} Decoded payload with userId and platform
 */
function verifyOAuthState(state) {
  try {
    return jwt.verify(state, process.env.JWT_SECRET);
  } catch (error) {
    logger.error('[Social] Invalid OAuth state:', error.message);
    throw new Error('Invalid or expired OAuth state');
  }
}

/**
 * GET /api/social/accounts
 * Get user's connected social accounts
 */
router.get('/accounts', requireJwtAuth, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({
      userId: req.user.id,
      isActive: true,
    }).select('-__v').sort({ createdAt: -1 });

    res.json({ accounts });
  } catch (error) {
    logger.error('[Social] Failed to get accounts:', error);
    res.status(500).json({ error: 'Failed to fetch social accounts' });
  }
});

/**
 * POST /api/social/connect/:platform
 * Initiate OAuth connection for a platform
 */
router.post('/connect/:platform', requireJwtAuth, async (req, res) => {
  try {
    const { platform } = req.params;
    const validPlatforms = ['linkedin', 'x', 'instagram', 'facebook', 'tiktok', 'youtube', 'pinterest'];
    
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: 'Invalid platform' });
    }

    // Check if user already has this platform connected
    const existing = await SocialAccount.findOne({
      userId: req.user.id,
      platform,
      isActive: true,
    });

    if (existing) {
      return res.status(400).json({ 
        error: 'Platform already connected',
        account: existing 
      });
    }

    // Generate secure state parameter with userId
    const state = generateOAuthState(req.user.id, platform);

    // Build callback URL with state
    const baseCallbackUrl = `${process.env.DOMAIN_SERVER || 'http://localhost:3090'}/api/social/callback/${platform}`;
    const callbackUrl = `${baseCallbackUrl}?state=${encodeURIComponent(state)}`;

    logger.info(`[Social] Initiating ${platform} connection for user ${req.user.id}`);

    // Initiate OAuth with Postiz
    const oauthData = await PostizService.initiateConnection(platform, callbackUrl);

    // Return OAuth URL for frontend to redirect
    res.json({
      oauthUrl: oauthData.url || oauthData.authUrl,
      platform,
      state,
    });
  } catch (error) {
    logger.error('[Social] Failed to initiate connection:', error);
    res.status(500).json({ 
      error: 'Failed to initiate connection',
      message: error.message 
    });
  }
});

/**
 * GET /api/social/callback/:platform
 * OAuth callback handler
 * Note: This route does NOT require authentication - userId comes from state parameter
 */
router.get('/callback/:platform', async (req, res) => {
  try {
    const { platform } = req.params;
    const { code, state, integration_id, error: oauthError } = req.query;

    const clientUrl = process.env.DOMAIN_CLIENT || 'http://localhost:3080';

    // Handle OAuth errors
    if (oauthError) {
      logger.error(`[Social] OAuth error for ${platform}:`, oauthError);
      return res.redirect(`${clientUrl}/settings?tab=social&error=oauth_${oauthError}`);
    }

    // Verify and decode state parameter to get userId
    let userId, statePlatform;
    try {
      const decoded = verifyOAuthState(state);
      userId = decoded.userId;
      statePlatform = decoded.platform;
      
      // Verify platform matches
      if (statePlatform !== platform) {
        throw new Error('Platform mismatch in state');
      }
    } catch (stateError) {
      logger.error('[Social] Invalid state parameter:', stateError.message);
      return res.redirect(`${clientUrl}/settings?tab=social&error=invalid_state`);
    }

    if (!integration_id) {
      logger.error(`[Social] No integration_id in callback for ${platform}`);
      return res.redirect(`${clientUrl}/settings?tab=social&error=oauth_failed`);
    }

    logger.info(`[Social] Processing OAuth callback for ${platform}, user ${userId}, integration ${integration_id}`);

    // Get integration details from Postiz
    let integration;
    try {
      integration = await PostizService.getIntegration(integration_id);
    } catch (postizError) {
      logger.error('[Social] Failed to get integration from Postiz:', postizError);
      return res.redirect(`${clientUrl}/settings?tab=social&error=postiz_error`);
    }

    // Save to database
    try {
      const savedAccount = await SocialAccount.findOneAndUpdate(
        { userId, platform },
        {
          userId,
          platform,
          postizIntegrationId: integration_id,
          accountName: integration.name || integration.identifier || `${platform} account`,
          accountId: integration.internalId || integration.id,
          isActive: true,
          metadata: {
            type: integration.type,
            picture: integration.picture,
            providerAccountId: integration.providerAccountId,
          },
        },
        { upsert: true, new: true }
      );

      logger.info(`[Social] Successfully connected ${platform} for user ${userId}`, {
        accountId: savedAccount._id,
        accountName: savedAccount.accountName,
      });
    } catch (dbError) {
      logger.error('[Social] Failed to save account to database:', dbError);
      return res.redirect(`${clientUrl}/settings?tab=social&error=save_failed`);
    }

    // Redirect back to settings with success
    res.redirect(`${clientUrl}/settings?tab=social&success=connected&platform=${platform}`);
  } catch (error) {
    logger.error('[Social] OAuth callback failed:', error);
    const clientUrl = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
    res.redirect(`${clientUrl}/settings?tab=social&error=connection_failed`);
  }
});

/**
 * DELETE /api/social/accounts/:id
 * Disconnect a social account
 */
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
    try {
      await PostizService.disconnectIntegration(account.postizIntegrationId);
    } catch (postizError) {
      logger.warn('[Social] Failed to disconnect from Postiz, continuing anyway:', postizError);
    }

    // Mark as inactive in our database
    account.isActive = false;
    await account.save();

    logger.info(`[Social] Disconnected ${account.platform} for user ${req.user.id}`);

    res.json({ 
      message: 'Account disconnected successfully',
      platform: account.platform 
    });
  } catch (error) {
    logger.error('[Social] Failed to disconnect account:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

/**
 * GET /api/social/status
 * Get connection status for all platforms
 */
router.get('/status', requireJwtAuth, async (req, res) => {
  try {
    const accounts = await SocialAccount.find({
      userId: req.user.id,
      isActive: true,
    }).select('platform accountName postizIntegrationId metadata createdAt');

    const status = {
      linkedin: accounts.find(a => a.platform === 'linkedin') || null,
      x: accounts.find(a => a.platform === 'x') || null,
      instagram: accounts.find(a => a.platform === 'instagram') || null,
      facebook: accounts.find(a => a.platform === 'facebook') || null,
      tiktok: accounts.find(a => a.platform === 'tiktok') || null,
      youtube: accounts.find(a => a.platform === 'youtube') || null,
      pinterest: accounts.find(a => a.platform === 'pinterest') || null,
    };

    res.json({ status, accounts });
  } catch (error) {
    logger.error('[Social] Failed to get status:', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
});

/**
 * GET /api/social/platforms
 * Get list of supported platforms
 */
router.get('/platforms', requireJwtAuth, async (req, res) => {
  const platforms = [
    { id: 'linkedin', name: 'LinkedIn', icon: 'linkedin', color: '#0077B5' },
    { id: 'x', name: 'X (Twitter)', icon: 'twitter', color: '#000000' },
    { id: 'instagram', name: 'Instagram', icon: 'instagram', color: '#E4405F' },
    { id: 'facebook', name: 'Facebook', icon: 'facebook', color: '#1877F2' },
    { id: 'tiktok', name: 'TikTok', icon: 'tiktok', color: '#000000' },
    { id: 'youtube', name: 'YouTube', icon: 'youtube', color: '#FF0000' },
    { id: 'pinterest', name: 'Pinterest', icon: 'pinterest', color: '#E60023' },
  ];

  res.json({ platforms });
});

/**
 * POST /api/social/posts
 * Create a post on selected social media platforms
 */
router.post('/posts', requireJwtAuth, async (req, res) => {
  try {
    const { content, integrationIds } = req.body;

    // Validation
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    if (!integrationIds || !Array.isArray(integrationIds) || integrationIds.length === 0) {
      return res.status(400).json({ error: 'At least one integration must be selected' });
    }

    logger.info(`[Social] Creating post for user ${req.user.id} on ${integrationIds.length} platforms`);

    // Create post via Postiz
    const postData = {
      content: content.trim(),
      integrations: integrationIds,
      // Immediate posting (no scheduling)
    };

    const result = await PostizService.createPost(postData);

    logger.info(`[Social] Post created successfully:`, result);

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

module.exports = router;
