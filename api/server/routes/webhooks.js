const express = require('express');
const webpush = require('web-push');
const { Message, User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

let vapidKeysSet = false;

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

router.post('/whatsapp', async (req, res) => {
  try {
    const internalApiKey = req.headers['x-internal-api-key'];
    const expectedApiKey = process.env.WA_WEBHOOK_API_KEY;

    if (!expectedApiKey || internalApiKey !== expectedApiKey) {
      return res.status(403).json({ message: 'Forbidden: Invalid API key' });
    }

    const { question_id, status, answer, author, sources, messageId } = req.body;

    // Send immediate OK
    res.status(200).json({ message: 'Webhook received' });

    if (!messageId) {
      logger.error('Webhook missing messageId:', req.body);
      return;
    }

    // Try to find the related message
    const message = await Message.findOne({ messageId }).lean();
    if (!message || !message.user) {
      logger.error(`Webhook Message not found or missing user field for messageId: ${messageId}`);
      return;
    }

    const userId = message.user;
    const user = await User.findById(userId).lean();

    if (!user) {
      logger.error(`Webhook User not found for userId: ${userId}`);
      return;
    }

    if (!user.pushSubscriptions || user.pushSubscriptions.length === 0) {
       // user does not have push subscriptions
       return;
    }
    
    if (!configureWebPush()) {
      return;
    }

    // Send push logic inside a loop
    for (const sub of user.pushSubscriptions) {
       try {
         // Determine truncated text for the body to prevent giant payloads
         const shortText = message.text && message.text.length > 50 ? message.text.substring(0, 50) + '...' : message.text;
         const payload = JSON.stringify({
            title: 'Your answer is ready!',
            body: `Your question "${shortText}" was recently answered.`,
            icon: '/assets/favicon.ico', 
            url: `/chat/${message.conversationId}` 
         });

         await webpush.sendNotification(sub, payload);
       } catch (err) {
         if (err.statusCode === 410 || err.statusCode === 404) {
           // Subscription is expired or invalid, remove it
           await User.findByIdAndUpdate(userId, {
             $pull: { pushSubscriptions: { endpoint: sub.endpoint } }
           });
           logger.info(`Removed expired push subscription for user ${userId}`);
         } else {
           logger.error('Error sending push notification', err);
         }
       }
    }

  } catch (err) {
    logger.error('Error in whatsapp webhook:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
});

module.exports = router;
