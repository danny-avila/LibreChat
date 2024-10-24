const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { updateUser, getUserById } = require('~/models/userMethods');
const { logger } = require('~/config');

const upgradeSubscription = async (userId, planId) => {
  try {
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.stripeCustomerId) {
      const stripeCustomer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString(),
        },
      });
      user.stripeCustomerId = stripeCustomer.id;
      await updateUser(user._id, { stripeCustomerId: stripeCustomer.id });
    }

    const session = await stripe.checkout.sessions.create({
      customer: user.stripeCustomerId,
      client_reference_id: user._id.toString(),
      payment_method_types: ['card'],
      line_items: [
        {
          price: planId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      subscription_data: {
        metadata: {
          userId: user._id.toString(),
        },
      },
      success_url: `${process.env.DOMAIN_CLIENT}/c/new`,
      cancel_url: `${process.env.DOMAIN_CLIENT}/c/new`,
    });

    return session;
  } catch (error) {
    logger.error('[upgradeSubscription] Error:', error);
    throw error;
  }
};

const handleSubscriptionUpdated = async (subscription) => {
  try {
    const user = await getUserById(subscription.metadata.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Get the first item from the subscription items
    const subscriptionItem = subscription.items.data[0];
    const productId = subscriptionItem.price.product;

    // Fetch the product details to get the name
    const product = await stripe.products.retrieve(productId);
    const planName = product.name.toLowerCase();

    const updatedData = {
      subscription: planName,
      subscriptionStatus: subscription.status,
      subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
    };

    // Update token balance based on the plan
    switch (updatedData.subscription) {
      case 'plus':
        updatedData.tokenBalance = 5000;
        break;
      case 'pro':
        updatedData.tokenBalance = 10000;
        break;
      case 'enterprise':
        updatedData.tokenBalance = 50000;
        break;
      default:
        updatedData.tokenBalance = 0; // Free plan
    }

    await updateUser(user._id, updatedData);
    logger.info(`[handleSubscriptionUpdated] Subscription updated for user ${user._id}`);
  } catch (error) {
    logger.error('[handleSubscriptionUpdated] Error:', error);
    throw error;
  }
};

module.exports = {
  upgradeSubscription,
  handleSubscriptionUpdated,
};