// api/server/controllers/StripeController.js
const { createSubscription, getSubscriptionStatus } = require('~/server/services/StripeService');
const Stripe = require('stripe');
const { User } = require('~/db/models');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { logger } = require('@librechat/data-schemas');
const { getAppConfig } = require('~/server/services/Config/app');
const { createTransaction } = require('~/models/Transaction');
const { getBalanceConfig } = require('@librechat/api');
const { Balance } = require('~/db/models');

/**
 * Security Best Practices for Stripe Integration:
 * - Always validate req.user and JWT for all subscription endpoints.
 * - Never log or expose STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET.
 * - Use express.raw middleware for webhook endpoint to ensure signature verification works.
 * - Log all Stripe errors and unhandled events for monitoring.
 * - Respond with appropriate HTTP status codes for all error cases.
 * - Keep Stripe API keys and secrets in environment variables, never in code or repo.
 */

// POST /api/stripe/subscribe
async function subscribeController(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    const user = req.user;
    const { priceId } = req.body;
    if (!priceId) return res.status(400).json({ error: 'Missing priceId' });
    const subscription = await createSubscription(user, priceId);
    res.json({ subscription });
  } catch (err) {
    console.error('Stripe subscribe error:', err);
    res.status(500).json({ error: err.message });
  }
}

// GET /api/stripe/status
async function subscriptionStatusController(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    const user = req.user;
    const status = await getSubscriptionStatus(user);
    res.json({ status });
  } catch (err) {
    console.error('Stripe status error:', err);
    res.status(500).json({ error: err.message });
  }
}


// POST /api/stripe/billing-portal
async function billingPortalController(req, res) {
  try {
    console.log('[billingPortalController] req.user:', req.user);
    console.log('[billingPortalController] req.headers.cookie:', req.headers.cookie);
    console.log('[billingPortalController] req.headers.authorization:', req.headers.authorization);
    if (!req.user || !req.user._id) {
      console.log('[billingPortalController] No user or user._id found');
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }
    const user = req.user;
    console.log('[billingPortalController] user.stripeCustomerId:', user.stripeCustomerId);
    if (!user.stripeCustomerId) {
      console.log('[billingPortalController] No Stripe customer ID found for user');
      return res.status(400).json({ error: 'No Stripe customer ID found for user' });
    }
    const returnUrl = process.env.DOMAIN_CLIENT || 'http://localhost:3080';
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe billing portal error:', err);
    res.status(500).json({ error: err.message });
  }
}


// POST /api/stripe/purchase
// Body: { priceId: string, quantity?: number, successUrl?: string, cancelUrl?: string }
async function productPurchaseController(req, res) {
  try {
    const { priceId, quantity = 1, successUrl, cancelUrl, metadata  } = req.body;
    if (!priceId) {
      return res.status(400).json({ error: 'Missing priceId' });
    }
    
    const user = req.user;

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
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price: priceId,
          quantity,
        },
      ],
      metadata: metadata,
      customer: customerId,
      allow_promotion_codes: true,
      success_url: successUrl ||  'http://localhost:3080' + '/purchase/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'http://localhost:3080' + '/purchase/canceled',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe product purchase error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Stripe webhook controller
async function stripeWebhookController(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  logger.debug('[Stripe Webhook] stripe-signature:', {
    sig: sig,
    requestBody: req.body,
    webhookKey: process.env.STRIPE_WEBHOOK_SECRET,
  });

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Detailed logging for Stripe webhook
  console.debug('[Stripe Webhook] Event received:', {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    request: event.request,
    request: event.data,
  });

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const status = subscription.status;
        const plan = subscription.items.data[0]?.price?.id || null;
        console.error(`[Stripe Webhook] Subscription event:`, {
          event: event.type,
          customerId,
          subscriptionId: subscription.id,
          status,
          plan,
        });
        await User.findOneAndUpdate(
          { stripeCustomerId: customerId },
          {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: status,
            subscriptionPlan: plan,
          }
        );
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        console.error(`[Stripe Webhook] Invoice payment failed:`, {
          event: event.type,
          customerId,
          invoiceId: invoice.id,
          amount_due: invoice.amount_due,
        });
        await User.findOneAndUpdate(
          { stripeCustomerId: customerId },
          { subscriptionStatus: 'payment_failed' }
        );
        break;
      }
      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        const trial_end = subscription.trial_end;
        console.error(`[Stripe Webhook] Trial will end:`, {
          event: event.type,
          customerId,
          subscriptionId: subscription.id,
          trial_end,
        });
        // Optionally notify user their trial is ending
        break;
      }
      case 'checkout.session.completed': {
        const appConfig = await getAppConfig();
        const balanceConfig = getBalanceConfig(appConfig);
        const product = event.data.object;
        if (product?.metadata?.tokenAmount) {
          const customerId = product.customer;        
          const user = await User.findOneAndUpdate(
            { stripeCustomerId: customerId },
            { stripeProductId: product.id }
          );

          // Assuming you have the user object or user._id
          const balanceRecord = await Balance.findOne({ user: user._id }, 'tokenCredits').lean();
          const currentBalance = balanceRecord ? (balanceRecord.tokenCredits + product.metadata?.amount) : product.metadata?.amount;

          await createTransaction({
            user: user._id, // MongoDB ObjectId or string
            tokenType: 'credits',
            context: 'admin', 
            rawAmount: product.metadata?.tokenAmount, 
            balance: balanceConfig,
          });
          console.error(`[Stripe Webhook] PaymentIntent event:`, {
            event: event.type,
            customerId,
            rawAmount: product.metadata?.tokenAmount,
            balance: balanceConfig,
          });        
          break;
        } else {
          const session = event.data.object;
          const customerId = session.customer;
          console.error(`[Stripe Webhook] Checkout session completed:`, {
            event: event.type,
            customerId,
            sessionId: session.id,
            amount_total: session.amount_total,
          });
          await User.findOneAndUpdate(
            { stripeCustomerId: customerId },
            { subscriptionStatus: 'active' }
          );
        }

        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const customerId = session.customer;
        console.error(`[Stripe Webhook] Checkout session expired:`, {
          event: event.type,
          customerId,
          sessionId: session.id,
        });
        await User.findOneAndUpdate(
          { stripeCustomerId: customerId },
          { subscriptionStatus: 'none', subscriptionPlan: null, stripeSubscriptionId: null }
        );
        break;
      }
      default:
        console.error(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
  } catch (err) {
    logger.error('Stripe webhook event handling error:', err, {
      eventType: event?.type,
      eventId: event?.id,
    });
    res.status(500).send('Webhook handler failed');
  }
}

module.exports = {
  subscribeController,
  subscriptionStatusController,
  stripeWebhookController,
  billingPortalController,
  productPurchaseController,
};
