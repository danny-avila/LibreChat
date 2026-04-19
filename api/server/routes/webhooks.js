const express = require('express');
const webpush = require('web-push');
const { Message, User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

let vapidKeysSet = false;

// Global to store the result of the last push for debugging without VM access
let lastPushResult = {
  timestamp: null,
  userId: null,
  endpoint: null,
  statusCode: null,
  error: null,
};

router.get('/debug-last', (req, res) => {
  res.status(200).json(lastPushResult);
});

// Middleware to configure Web-Push keys on the first request if they change or just once
function configureWebPush() {
  if (vapidKeysSet) return true;
  
  const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
  const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

  if (!publicVapidKey || !privateVapidKey) {
    logger.warn('VAPID keys are disabled or missing from .env! Push notifications will fail.');
    return false;
  }

  webpush.setVapidDetails(vapidEmail, publicVapidKey, privateVapidKey);
  vapidKeysSet = true;
  return true;
}

router.post('/notifications', async (req, res) => {
  try {
    const internalApiKey = req.headers['x-internal-api-key'];
    const expectedApiKey = process.env.WEB_WEBHOOK_API_KEY;

    // 🔐 Auth check
    if (!expectedApiKey || internalApiKey !== expectedApiKey) {
      console.log('[DEBUG-AUTH]', {
        expectedApiKey,
        internalApiKey,
        match: internalApiKey === expectedApiKey,
      });
      return res.status(403).json({ message: 'Forbidden: Invalid API key' });
    }

    const {
      messageId,
      question,
      originalQuestion,
    } = req.body;

    if (!messageId) {
      return res.status(400).json({ message: 'Missing messageId' });
    }

    // 🔍 Find message
    const message = await Message.findOne({ messageId }).lean();
    if (!message || !message.user) {
      return res.status(404).json({
        message: 'Message not found or missing user',
        messageId,
      });
    }

   // const userId = "69da2a7207752c2de1b2b372"; // ⚠️ hardcoded (be careful)
     const userId = message.user;

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        message: 'User not found',
        userId,
      });
    }

    if (!user.pushSubscriptions || user.pushSubscriptions.length === 0) {
      return res.status(400).json({
        message: 'User has no push subscriptions',
        userId,
      });
    }

    if (!configureWebPush()) {
      return res.status(500).json({
        message: 'Web push not configured (VAPID issue)',
      });
    }

    const displayQuestion = originalQuestion || question;
    const conversationId = message.conversationId;

    let successCount = 0;
    let failureCount = 0;

    // 🚀 Send push notifications
    for (const sub of user.pushSubscriptions) {
      try {
        const clientDomain = process.env.DOMAIN_CLIENT || 'https://chat.annam.ai';
        const payload = JSON.stringify({
          title: 'Your answer is ready!',
          body: `Your question "${displayQuestion}" was recently answered.`,
          icon: '/assets/annam-logo.png',
          url: `${clientDomain}/c/${conversationId}`,
        });

        logger.info(`[PUSH-DEBUG] Attempting send to endpoint (last 15 chars): ${sub.endpoint.slice(-15)}`);
        const pushResponse = await webpush.sendNotification(sub, payload);
        
        lastPushResult = {
          timestamp: new Date().toISOString(),
          userId,
          endpoint: sub.endpoint.slice(-15),
          statusCode: pushResponse.statusCode,
          error: null,
        };

        logger.info('Push sent successfully', {
          statusCode: pushResponse.statusCode,
          endpoint: sub.endpoint.slice(-15),
        });
        successCount++;
      } catch (err) {
        lastPushResult = {
          timestamp: new Date().toISOString(),
          userId,
          endpoint: sub.endpoint ? sub.endpoint.slice(-15) : 'unknown',
          statusCode: err.statusCode || 500,
          error: err.message,
        };
        failureCount++;

        if (err.statusCode === 410 || err.statusCode === 404) {
          await User.findByIdAndUpdate(userId, {
            $pull: { pushSubscriptions: { endpoint: sub.endpoint } },
          });
          logger.info(`Removed expired subscription`);
        } else {
          logger.error('Push send error', err);
        }
      }
    }

    // ✅ Final response AFTER processing
    return res.status(200).json({
      message: 'Push processing completed',
      successCount,
      failureCount,
      total: user.pushSubscriptions.length,
    });

  } catch (err) {
    logger.error('Webhook error:', err);

    return res.status(500).json({
      message: 'Server error',
      error: err.message,
    });
  }
});

module.exports = router;
