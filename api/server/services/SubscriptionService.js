const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { updateUser, getUserById } = require('~/models/userMethods');
const { Transaction } = require('~/models/Transaction');
const Balance = require('~/models/Balance');
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

    const subscriptionItem = subscription.items.data[0];
    const productId = subscriptionItem.price.product;
    const product = await stripe.products.retrieve(productId);
    const planName = product.name.toLowerCase();
    const context = subscription.metadata?.context || 'update';

    const updatedData = {
      subscription: subscription.status === 'canceled' ? 'free' : planName,
      subscriptionStatus: subscription.status,
      subscriptionExpiresAt: new Date(subscription.current_period_end * 1000),
    };

    // Define token amounts based on plan
    let tokenAmount = 0;
    switch (planName) {
      case 'plus':
        tokenAmount = 5000;
        break;
      case 'pro':
        tokenAmount = 10000;
        break;
      case 'enterprise':
        tokenAmount = 50000;
        break;
      default:
        tokenAmount = 0; // Free plan
    }

    if (tokenAmount > 0 && (context === 'initial' || context === 'renewal')) {
      // Get current balance
      const currentBalance = await Balance.findOne({ user: user._id }).lean();
      const previousBalance = currentBalance?.tokenCredits || 0;

      // Create transaction record
      await Transaction.create({
        user: user._id,
        tokenType: 'credits',
        context: context === 'renewal' ? 'subscription_renewal' : 'subscription',
        rawAmount: tokenAmount,
        metadata: {
          source: context === 'renewal' ? 'subscription_renewal' : 'subscription',
          planType: planName,
          previousBalance,
        },
      });

      // Update or create Balance document
      await Balance.findOneAndUpdate(
        { user: user._id },
        { $set: { tokenCredits: tokenAmount } },
        { upsert: true, new: true },
      );

      // Update user's token balance field
      updatedData.tokenBalance = tokenAmount;

      logger.info(`[handleSubscriptionUpdated] ${context === 'renewal' ? 'Reset' : 'Set'} token balance for user ${user._id}`, {
        previousBalance,
        newBalance: tokenAmount,
        planName,
        context,
      });
    } else if (subscription.status === 'canceled') {
      // Reset balance to 0 for canceled subscriptions
      await Balance.findOneAndUpdate(
        { user: user._id },
        { $set: { tokenCredits: 0 } },
        { upsert: true },
      );
      updatedData.tokenBalance = 0;
    }

    await updateUser(user._id, updatedData);

    logger.info(`[handleSubscriptionUpdated] Subscription ${context} for user ${user._id}`, {
      subscription: planName,
      tokenAmount,
      status: subscription.status,
      context,
    });
  } catch (error) {
    logger.error('[handleSubscriptionUpdated] Error:', error);
    throw error;
  }
};

module.exports = {
  upgradeSubscription,
  handleSubscriptionUpdated,
};