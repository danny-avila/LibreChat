const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { requireJwtAuth } = require('../middleware');
const SocialAccount = require('~/models/SocialAccount');
const LinkedInService = require('../services/LinkedInService');
const logger = require('~/config/winston');

/**
 * Generate secure OAuth state parameter
 * @param {string} userId - User ID to encode
 * @returns {string} Signed JWT token
 */
function generateState(userId) {
  const payload = {
    userId,
    platform: 'linkedin',
    timestamp: Date.now(),
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '10m' });
}

/**
 * Verify and decode OAuth state parameter
 * @param {string} state - State parameter from OAuth callback
 * @returns {Object} Decoded payload with userId
 */
function verifyState(state) {
  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    if (decoded.platform !== 'linkedin') {
      throw new Error('Invalid platform in state');
    }
    return decoded;
  } catch (error) {
    logger.error('[LinkedIn] Invalid OAuth state:', error.message);
    throw new Error('Invalid or expired OAuth state');
  }
}

/**
 * Check if token needs refresh and refresh if necessary
 * @param {Object} account - Social account object
 * @returns {Promise<string>} Valid access token
 */
async function getValidAccessToken(account) {
  // Check if token is expired or will expire in next 5 minutes
  const expiresAt = new Date(account.expiresAt);
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  if (expiresAt <= fiveMinutesFromNow && account.refreshToken) {
    try {
      logger.info('[LinkedIn] Refreshing access token for user', account.userId);
      
      const { accessToken, expiresIn, refreshToken } = await LinkedInService.refreshAccessToken(
        account.refreshToken
      );

      // Update account with new token
      account.accessToken = accessToken;
      account.refreshToken = refreshToken;
      account.expiresAt = new Date(Date.now() + expiresIn * 1000);
      await account.save();

      return accessToken;
    } catch (error) {
      logger.error('[LinkedIn] Token refresh failed:', error.message);
      throw new Error('LinkedIn token expired. Please reconnect your account.');
    }
  }

  return account.accessToken;
}

/**
 * GET /api/linkedin/connect
 * Initiate LinkedIn OAuth flow
 * Supports both token query parameter (dev mode) and standard JWT auth (production)
 */
router.get('/connect', async (req, res) => {
  // Use LIBRECHAT_URL for OAuth redirects (public URL), fallback to DOMAIN_CLIENT for dev
  const clientUrl = process.env.LIBRECHAT_URL || process.env.DOMAIN_CLIENT;
  
  try {
    let userId;
    
    // Check for token in query parameter (for cross-origin dev mode)
    const tokenFromQuery = req.query.token;
    
    if (tokenFromQuery) {
      // Dev mode: token passed as query parameter
      try {
        const decoded = jwt.verify(tokenFromQuery, process.env.JWT_SECRET);
        userId = decoded.id;
        logger.info(`[LinkedIn] Dev mode - Using token from query parameter for user ${userId}`);
        
        // Generate state and redirect to LinkedIn
        const state = generateState(userId);
        const authUrl = LinkedInService.getAuthUrl(state);
        
        logger.info(`[LinkedIn] Redirecting to LinkedIn OAuth for user ${userId}`);
        return res.redirect(authUrl);
      } catch (error) {
        logger.error('[LinkedIn] Invalid token in query parameter:', error.message);
        return res.redirect(`${clientUrl}/?settings=true&tab=social&error=invalid_token&platform=linkedin`);
      }
    }
    
    // Production mode: use standard JWT auth from cookie/header
    // We need to manually call passport.authenticate here
    passport.authenticate('jwt', { session: false }, (err, user, info) => {
      if (err) {
        logger.error('[LinkedIn] Authentication error:', err);
        return res.redirect(`${clientUrl}/?settings=true&tab=social&error=auth_error&platform=linkedin`);
      }
      
      if (!user) {
        logger.error('[LinkedIn] No user found in JWT');
        return res.redirect(`${clientUrl}/?settings=true&tab=social&error=unauthorized&platform=linkedin`);
      }
      
      try {
        userId = user.id;
        const state = generateState(userId);
        const authUrl = LinkedInService.getAuthUrl(state);
        
        logger.info(`[LinkedIn] Production mode - Redirecting to LinkedIn OAuth for user ${userId}`);
        res.redirect(authUrl);
      } catch (error) {
        logger.error('[LinkedIn] Failed to generate auth URL:', error);
        res.redirect(`${clientUrl}/?settings=true&tab=social&error=connect_failed&platform=linkedin`);
      }
    })(req, res);
  } catch (error) {
    logger.error('[LinkedIn] Connect initiation failed:', error);
    res.redirect(`${clientUrl}/?settings=true&tab=social&error=connect_failed&platform=linkedin`);
  }
});

/**
 * GET /api/linkedin/callback
 * LinkedIn OAuth callback handler
 * Note: This route does NOT use requireJwtAuth because the state parameter contains the userId
 */
router.get('/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  // Use LIBRECHAT_URL for OAuth redirects (public URL), fallback to DOMAIN_CLIENT for dev
  const clientUrl = process.env.LIBRECHAT_URL || process.env.DOMAIN_CLIENT;

  // Handle OAuth errors
  if (oauthError) {
    logger.error(`[LinkedIn] OAuth error: ${oauthError}`);
    return res.redirect(`${clientUrl}/?settings=true&tab=social&error=oauth_${oauthError}&platform=linkedin`);
  }

  if (!code || !state) {
    logger.error('[LinkedIn] Missing code or state in callback');
    return res.redirect(`${clientUrl}/?settings=true&tab=social&error=invalid_callback&platform=linkedin`);
  }

  try {
    // Verify state parameter (contains userId)
    const { userId } = verifyState(state);

    logger.info(`[LinkedIn] Processing OAuth callback for user ${userId}`);

    // Exchange code for access token
    const { accessToken, refreshToken, expiresIn } = await LinkedInService.exchangeCodeForToken(code);

    // Get user profile
    const profile = await LinkedInService.getUserProfile(accessToken);

    // Save to database
    await SocialAccount.findOneAndUpdate(
      { userId, platform: 'linkedin' },
      {
        userId,
        platform: 'linkedin',
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        accountName: profile.name || profile.email,
        accountId: profile.sub,
        isActive: true,
        metadata: {
          email: profile.email,
          picture: profile.picture,
          givenName: profile.given_name,
          familyName: profile.family_name,
        },
      },
      { upsert: true, new: true }
    );

    logger.info(`[LinkedIn] Successfully connected account for user ${userId}`);
    res.redirect(`${clientUrl}/?settings=true&tab=social&success=connected&platform=linkedin`);
  } catch (error) {
    logger.error('[LinkedIn] OAuth callback failed:', error);
    res.redirect(`${clientUrl}/?settings=true&tab=social&error=connection_failed&platform=linkedin&message=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /api/linkedin/status
 * Get LinkedIn connection status for current user
 */
router.get('/status', requireJwtAuth, async (req, res) => {
  try {
    const account = await SocialAccount.findOne({
      userId: req.user.id,
      platform: 'linkedin',
      isActive: true,
    }).select('-accessToken -refreshToken');

    if (!account) {
      return res.json({
        connected: false,
        account: null,
      });
    }

    res.json({
      connected: true,
      account: {
        accountName: account.accountName,
        accountId: account.accountId,
        connectedAt: account.createdAt,
        metadata: account.metadata,
      },
    });
  } catch (error) {
    logger.error('[LinkedIn] Failed to get status:', error);
    res.status(500).json({ error: 'Failed to get LinkedIn status' });
  }
});

/**
 * POST /api/linkedin/posts
 * Create a post on LinkedIn
 */
router.post('/posts', requireJwtAuth, async (req, res) => {
  try {
    const { content, visibility } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const account = await SocialAccount.findOne({
      userId: req.user.id,
      platform: 'linkedin',
      isActive: true,
    });

    if (!account) {
      return res.status(400).json({
        error: 'LinkedIn account not connected',
        message: 'Please connect your LinkedIn account first',
      });
    }

    // Get valid access token (refreshes if needed)
    const accessToken = await getValidAccessToken(account);

    // Create post
    const personUrn = `urn:li:person:${account.accountId}`;
    const result = await LinkedInService.createPost(
      accessToken,
      personUrn,
      content.trim(),
      visibility || 'PUBLIC'
    );

    logger.info(`[LinkedIn] Post created for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Post published to LinkedIn',
      post: {
        id: result.id,
        urn: result.id,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('[LinkedIn] Failed to create post:', error);
    res.status(500).json({
      error: 'Failed to create post',
      message: error.message,
    });
  }
});

/**
 * POST /api/linkedin/comments
 * Post a comment on a LinkedIn post
 */
router.post('/comments', requireJwtAuth, async (req, res) => {
  try {
    const { postUrn, comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    if (!postUrn) {
      return res.status(400).json({ error: 'Post URN is required' });
    }

    const account = await SocialAccount.findOne({
      userId: req.user.id,
      platform: 'linkedin',
      isActive: true,
    });

    if (!account) {
      return res.status(400).json({
        error: 'LinkedIn account not connected',
      });
    }

    const accessToken = await getValidAccessToken(account);

    const result = await LinkedInService.postComment(
      accessToken,
      postUrn,
      comment.trim()
    );

    logger.info(`[LinkedIn] Comment posted for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Comment posted to LinkedIn',
      comment: {
        id: result.id,
        urn: result.id,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('[LinkedIn] Failed to post comment:', error);
    res.status(500).json({
      error: 'Failed to post comment',
      message: error.message,
    });
  }
});

/**
 * POST /api/linkedin/comments/:commentUrn/reply
 * Reply to a comment on LinkedIn
 */
router.post('/comments/:commentUrn/reply', requireJwtAuth, async (req, res) => {
  try {
    const { commentUrn } = req.params;
    const { reply } = req.body;

    if (!reply || !reply.trim()) {
      return res.status(400).json({ error: 'Reply text is required' });
    }

    const account = await SocialAccount.findOne({
      userId: req.user.id,
      platform: 'linkedin',
      isActive: true,
    });

    if (!account) {
      return res.status(400).json({
        error: 'LinkedIn account not connected',
      });
    }

    const accessToken = await getValidAccessToken(account);

    const result = await LinkedInService.replyToComment(
      accessToken,
      commentUrn,
      reply.trim()
    );

    logger.info(`[LinkedIn] Reply posted for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'Reply posted to LinkedIn',
      reply: {
        id: result.id,
        urn: result.id,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    logger.error('[LinkedIn] Failed to reply to comment:', error);
    res.status(500).json({
      error: 'Failed to reply to comment',
      message: error.message,
    });
  }
});

/**
 * GET /api/linkedin/comments/:postUrn
 * Get comments on a LinkedIn post
 */
router.get('/comments/:postUrn', requireJwtAuth, async (req, res) => {
  try {
    const { postUrn } = req.params;

    const account = await SocialAccount.findOne({
      userId: req.user.id,
      platform: 'linkedin',
      isActive: true,
    });

    if (!account) {
      return res.status(400).json({
        error: 'LinkedIn account not connected',
      });
    }

    const accessToken = await getValidAccessToken(account);

    const comments = await LinkedInService.getComments(accessToken, postUrn);

    res.json({
      success: true,
      comments: comments.map(comment => ({
        id: comment.id,
        urn: comment.id,
        text: comment.message?.text || '',
        author: comment.actor,
        createdAt: comment.created?.time || new Date(),
        likeCount: comment.likesSummary?.totalLikes || 0,
      })),
    });
  } catch (error) {
    logger.error('[LinkedIn] Failed to get comments:', error);
    res.status(500).json({
      error: 'Failed to get comments',
      message: error.message,
    });
  }
});

/**
 * DELETE /api/linkedin/disconnect
 * Disconnect LinkedIn account
 */
router.delete('/disconnect', requireJwtAuth, async (req, res) => {
  try {
    const result = await SocialAccount.findOneAndUpdate(
      { userId: req.user.id, platform: 'linkedin' },
      { isActive: false },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({ error: 'LinkedIn account not found' });
    }

    logger.info(`[LinkedIn] Account disconnected for user ${req.user.id}`);

    res.json({
      success: true,
      message: 'LinkedIn account disconnected successfully',
    });
  } catch (error) {
    logger.error('[LinkedIn] Failed to disconnect:', error);
    res.status(500).json({
      error: 'Failed to disconnect LinkedIn account',
      message: error.message,
    });
  }
});

module.exports = router;
