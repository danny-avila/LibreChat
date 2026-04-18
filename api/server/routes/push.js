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

router.post('/subscribe', requireJwtAuth, async (req, res) => {
  try {
   console.log("the first console====")
    const subscription = req.body;
    console.log("the subscription is calling====",subscription)
    
    // Using $addToSet to avoid exact duplicate subscriptions, although endpoints might vary
    // If the endpoint already exists, we might want to update it instead handling unique endpoints.
    // For simplicity, let's pull the existing endpoint first, then push the new one.
    if (subscription && subscription.endpoint) {
      console.log("the subscription if block===",subscription.endpoint)
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
