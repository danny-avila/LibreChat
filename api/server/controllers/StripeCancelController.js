// api/server/controllers/StripeCancelController.js
const Stripe = require('stripe');
const { User } = require('~/db/models');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/stripe/cancel-subscription
async function cancelSubscriptionController(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    const user = req.user;
    if (!user.stripeSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }
    // Cancel the Stripe subscription immediately
    await stripe.subscriptions.cancel(user.stripeSubscriptionId);
    await User.findByIdAndUpdate(user._id, {
      stripeSubscriptionId: null,
      subscriptionStatus: 'canceled',
      subscriptionPlan: null,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Stripe cancel subscription error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { cancelSubscriptionController };
