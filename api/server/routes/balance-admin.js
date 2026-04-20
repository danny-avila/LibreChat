const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { User, Balance } = require('~/db/models');
const { createTransaction } = require('~/models');
const { getBalanceConfig } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const { logger } = require('@librechat/data-schemas');

/**
 * Middleware to check for the Shared API Key with timestamp-based signature.
 * This secures the endpoint so only the Laravel backend can call it.
 * Prevents replay attacks by validating timestamp expiration.
 */
const checkApiKey = (req, res, next) => {
  const signature = req.headers['x-api-signature'];
  const timestamp = req.headers['x-api-timestamp'];
  const validKey = process.env.LIBRECHAT_API_KEY;

  if (!validKey) {
    logger.error('LIBRECHAT_API_KEY is not set in environment variables.');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!signature || !timestamp) {
    logger.warn(`Missing signature or timestamp from ${req.ip}`);
    return res.status(403).json({ error: 'Missing authentication headers' });
  }

  // Validate timestamp (must be within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  const timeDiff = Math.abs(now - requestTime);
  const expirationSeconds = 300; // 5 minutes

  if (isNaN(requestTime)) {
    logger.warn(`Invalid timestamp format from ${req.ip}`);
    return res.status(403).json({ error: 'Invalid timestamp' });
  }

  if (timeDiff > expirationSeconds) {
    logger.warn(`Expired request from ${req.ip}: time diff ${timeDiff}s`);
    return res.status(403).json({ error: 'Request expired' });
  }

  // Generate expected signature: MD5(API_KEY + timestamp)
  const expectedSignature = crypto
    .createHash('md5')
    .update(validKey + timestamp)
    .digest('hex');

  if (signature !== expectedSignature) {
    logger.warn(`Invalid signature from ${req.ip}`);
    return res.status(403).json({ error: 'Invalid signature' });
  }

  next();
};

/**
 * POST /api/balance-admin/set
 * Manually set a user's balance and record a transaction.
 * Body: { email, tokenCredits, context }
 */
router.post('/set', checkApiKey, async (req, res) => {
  const { email, tokenCredits, context } = req.body;

  if (!email || tokenCredits === undefined) {
    return res.status(400).json({ error: 'Email and tokenCredits are required' });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ error: `User not found with email: ${email}` });
    }

    // Get app config and balance config
    const appConfig = await getAppConfig();
    const balanceConfig = getBalanceConfig(appConfig);

    if (!balanceConfig?.enabled) {
      return res.status(500).json({ error: 'Balance is not enabled in LibreChat configuration' });
    }

    // Get current balance to calculate delta and return it in response
    const currentBalanceDoc = await Balance.findOne({ user: user._id });
    const currentCredits = currentBalanceDoc ? currentBalanceDoc.tokenCredits : 0;
    const newCredits = parseInt(tokenCredits, 10);
    const delta = newCredits - currentCredits;

    // Use createTransaction (same as add-balance.js)
    // Note: We pass delta as rawAmount because createTransaction expects the amount to ADD
    const result = await createTransaction({
      user: user._id,
      tokenType: 'credits',
      context: context || 'manual_set',
      rawAmount: delta,
      balance: balanceConfig,
    });

    if (!result?.balance) {
      throw new Error('Failed to create transaction or update balance');
    }

    logger.info(`Balance manually set for ${email}: ${currentCredits} -> ${result.balance} (Delta: ${delta})`);

    res.json({
      success: true,
      email: user.email,
      balance: result.balance,
      transactionId: result.transactionId,
      previousBalance: currentCredits,
    });

  } catch (error) {
    logger.error('Error setting balance:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

/**
 * GET /api/balance-admin/:email
 * Get a user's current balance.
 */
router.get('/:email', checkApiKey, async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const balance = await Balance.findOne({ user: user._id });
    const credits = balance ? balance.tokenCredits : 0;

    res.json({
      email: user.email,
      tokenCredits: credits,
    });
  } catch (error) {
    logger.error('Error getting balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
