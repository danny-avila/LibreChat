const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const getRawBody = require('raw-body');
const { logger } = require('~/config');

const STRIPE_SIGNATURE_HEADER = 'stripe-signature';

const StripeWebhooks = {
  AsyncPaymentSuccess: 'checkout.session.async_payment_succeeded',
  AsyncPaymentFailed: 'checkout.session.async_payment_failed',
  Completed: 'checkout.session.completed',
  SubscriptionDeleted: 'customer.subscription.deleted',
  SubscriptionUpdated: 'customer.subscription.updated',
  ChargeSuccess: 'charge.succeeded',
};

// MongoDB connection
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers[STRIPE_SIGNATURE_HEADER];
  const rawBody = await getRawBody(req);

  if (!signature) {
    return res.status(400).send('Webhook Error: No signature');
  }
  let event = null;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.PAYMENTS_SIGNING_SECRET,
    );
  } catch (err) {
    logger.error('Stripe webhook error:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event) {
    const { metadata } = event.data.object;

    switch (event.type) {
      case StripeWebhooks.ChargeSuccess:
        logger.info('StripeWebhooks.ChargeSuccess', metadata);
        break;
      case StripeWebhooks.SubscriptionDeleted:
        logger.info('StripeWebhooks.SubscriptionDeleted', metadata);
        await handleSubscriptionDeleted(event.data.object);
        break;
      case StripeWebhooks.SubscriptionUpdated:
        logger.info('StripeWebhooks.SubscriptionUpdated', metadata);
        await handleSubscriptionUpdated(event.data.object);
        break;
      case StripeWebhooks.AsyncPaymentSuccess:
        logger.info('StripeWebhooks.AsyncPaymentSuccess', metadata);
        break;
      case StripeWebhooks.Completed:
        logger.info('StripeWebhooks.Completed', metadata);
        if (metadata?.userId && metadata?.planType) {
          await updateSubscription(metadata.userId, metadata.planType);
        }
        break;
      case StripeWebhooks.AsyncPaymentFailed:
        logger.info('StripeWebhooks.AsyncPaymentFailed', metadata);
        break;
      default:
        return res
          .status(400)
          .send(`Webhook Error: Unhandled event type ${event.type}`);
    }
  } else {
    return res.status(400).send('Webhook Error: Event not created');
  }

  res.status(200).send({ received: true });
});

async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  const cancelAt = new Date(subscription.current_period_end * 1000);

  try {
    await client.connect();
    const database = client.db(process.env.MONGODB_DATABASE);
    const users = database.collection('users');

    await users.updateOne(
      { stripeCustomerId: customerId },
      {
        $set: {
          subscriptionType: null,
          cancelAtPeriodEnd: false,
          cancelAt: cancelAt,
        },
      },
    );
    logger.info(`Subscription cancelled for customer ${customerId}`);
  } catch (error) {
    logger.error(`Error updating subscription for customer ${customerId}:`, error);
  } finally {
    await client.close();
  }
}

async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  const newPlanId = subscription.items.data[0].price.id;

  try {
    await client.connect();
    const database = client.db(process.env.MONGODB_DATABASE);
    const users = database.collection('users');

    await users.updateOne(
      { stripeCustomerId: customerId },
      {
        $set: {
          subscriptionType: newPlanId,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null,
        },
      },
    );
    logger.info(`Subscription updated for customer ${customerId}`);
  } catch (error) {
    logger.error(`Error updating subscription for customer ${customerId}:`, error);
  } finally {
    await client.close();
  }
}

async function updateSubscription(userId, planType) {
  try {
    await client.connect();
    const database = client.db(process.env.MONGODB_DATABASE);
    const users = database.collection('users');

    await users.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { subscriptionType: planType } },
    );
    logger.info(`Subscription updated for user ${userId}`);
  } catch (error) {
    logger.error(`Error updating subscription for user ${userId}:`, error);
  } finally {
    await client.close();
  }
}

module.exports = router;
