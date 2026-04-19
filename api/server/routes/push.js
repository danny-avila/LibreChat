const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('~/server/middleware');
const { User } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

router.get('/key', (req, res) => {
  const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicVapidKey) {
    return res.status(500).json({ message: 'VAPID_PUBLIC_KEY not configured' });
  }
  res.status(200).json({ key: publicVapidKey });
});

router.get('/debug', (req, res) => {
  const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
  const vapidEmail = process.env.VAPID_EMAIL;
  
  res.status(200).json({
    vapidPublicKeyConfigured: !!publicVapidKey,
    vapidPublicKeyPreview: publicVapidKey ? `${publicVapidKey.slice(0, 5)}...${publicVapidKey.slice(-5)}` : null,
    vapidPublicKeyLength: publicVapidKey ? publicVapidKey.length : 0,
    vapidEmailConfigured: !!vapidEmail,
    vapidEmailPreview: vapidEmail ? `${vapidEmail.slice(0, 5)}...` : null,
    env: process.env.NODE_ENV,
  });
});

router.post('/subscribe', requireJwtAuth, async (req, res) => {
  try {
    const subscription = req.body
    
    // Using $addToSet to avoid exact duplicate subscriptions, although endpoints might vary
    // If the endpoint already exists, we might want to update it instead handling unique endpoints.
    // For simplicity, let's pull the existing endpoint first, then push the new one.
    if (subscription && subscription.endpoint) {
       await User.findByIdAndUpdate(req.user.id, {
         $pull: { pushSubscriptions: { endpoint: subscription.endpoint } }
       });
       await User.findByIdAndUpdate(req.user.id, {
         $push: { pushSubscriptions: subscription }
       });
    }

    res.status(201).json({ message: 'Subscription saved.' });
  } catch (err) {
    logger.error('Error saving push subscription:', err);
    res.status(500).json({ message: 'Error saving subscription' });
  }
});

module.exports = router;
