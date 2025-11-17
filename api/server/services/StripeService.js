// api/server/services/StripeService.js
const Stripe = require('stripe');
const { User } = require('~/db/models');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function createCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    metadata: { userId: user._id.toString() },
  });
  await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
  return customer.id;
}

async function createSubscription(user, priceId) {
  const customerId = await createCustomer(user);
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent'],
  });
  await User.findByIdAndUpdate(user._id, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    subscriptionPlan: priceId,
  });
  return subscription;
}

async function getSubscriptionStatus(user) {
  if (!user.stripeSubscriptionId) return 'none';
  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  return subscription.status;
}

async function syncUserSubscription(user) {
  if (!user.stripeSubscriptionId) return;
  try {
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    await User.findByIdAndUpdate(user._id, {
      subscriptionStatus: subscription.status,
      subscriptionPlan: subscription.items.data[0]?.price?.id || null,
    });
  } catch (err) {
    // If subscription not found, clear fields
    if (err.code === 'resource_missing') {
      await User.findByIdAndUpdate(user._id, {
        stripeSubscriptionId: null,
        subscriptionStatus: 'none',
        subscriptionPlan: null,
      });
    } else {
      throw err;
    }
  }
}

module.exports = {
  createCustomer,
  createSubscription,
  getSubscriptionStatus,
  syncUserSubscription,
};
