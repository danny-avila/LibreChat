// api/server/controllers/StripeCheckoutController.js
const Stripe = require('stripe');
const { User } = require('~/db/models');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// POST /api/stripe/create-checkout-session
async function createCheckoutSessionController(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    const user = req.user;
    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: 'Missing priceId' });

    // Create Stripe customer if needed
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user._id.toString() },
      });
      customerId = customer.id;
      await User.findByIdAndUpdate(user._id, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.STRIPE_SUCCESS_URL}` || 'http://localhost:3000/account/subscription/success',
      cancel_url: `${process.env.STRIPE_CANCEL_URL}` || 'http://localhost:3000/account/subscription/canceled',
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: user._id.toString() },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { createCheckoutSessionController };
