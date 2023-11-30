require('dotenv').config();
const express = require('express');
const router = express.Router();
const Payment = require('../../models/payments.js');
const PaymentRefUserId = require('../../models/paymentReference.js');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const {
  calcExpiryDate,
  createPaymentRecord } = require('../../subscriptionManagement/subscriptionUtils.js'); // getUserSessionFromReference
const moment = require('moment-timezone');
const Stripe = require('stripe');

// Convert callback-based functions to promises
const baseFrontendUrl = process.env.BASE_FRONTEND_URL;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// planPricing
const planPricing = {
  month: {
    price: 120.00,
    currency: 'CNY'
  },
  quarter: {
    price: 320.00,
    currency: 'CNY'
  },
  year: {
    price: 1100.00,
    currency: 'CNY'
  }
};

// Endpoint for creating WeChat Pay payment
router.post('/create-payment-wechatpay', requireJwtAuth, async (req, res) => {
  const { userId, paymentReference, planId } = req.body;

  if (!planPricing[planId]) {
    return res.status(400).json({ error: 'Invalid planId' });
  }

  const priceDetails = planPricing[planId];

  await PaymentRefUserId.savePaymentRefUserId({
    paymentReference,
    userId
  });

  try {
    const stripeParams = {
      payment_method_types: ['wechat_pay'],
      payment_method_options: {
        wechat_pay: { client: 'web' },
      },
      line_items: [{
        price_data: {
          currency: priceDetails.currency,
          product_data: {
            name: `Subscription - ${planId}`,
          },
          unit_amount: priceDetails.price * 100, // Convert to smallest currency unit, e.g., cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseFrontendUrl}/subscription/wechat-return` +
        `?paymentReference=${paymentReference}` +
        '&paymentMethod=wechatpay' +
        `&userId=${userId}` +
        '&sessionId={CHECKOUT_SESSION_ID}' +
        `&planId=${planId}`,
      cancel_url: `${baseFrontendUrl}/subscription/payment-failed`,
    };
    console.log(`wechatpay successful url: ${stripeParams.success_url}`)
    const session = await stripe.checkout.sessions.create(stripeParams);
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error(`[Create WeChat Pay Payment] Error creating WeChat Pay checkout session: ${error}`);
    res.status(500).json({ error: error.toString() });
  }
});

// Alipay Endpoint
router.post('/create-payment-alipay', requireJwtAuth, async (req, res) => {
  const { userId, paymentReference, planId } = req.body;

  if (!planPricing[planId]) {
    return res.status(400).json({ error: 'Invalid planId' });
  }

  const priceDetails = planPricing[planId];

  await PaymentRefUserId.savePaymentRefUserId({
    paymentReference,
    userId
  });

  try {
    const stripeParams = {
      payment_method_types: ['alipay'],
      line_items: [{
        price_data: {
          currency: priceDetails.currency,
          product_data: {
            name: `Subscription - ${planId}`,
          },
          unit_amount: priceDetails.price * 100, // Convert to smallest currency unit
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseFrontendUrl}/subscription/alipay-return` +
        `?paymentReference=${paymentReference}` +
        '&paymentMethod=alipay' +
        `&userId=${userId}` +
        '&sessionId={CHECKOUT_SESSION_ID}' +
        `&planId=${planId}`,
      cancel_url: `${baseFrontendUrl}/subscription/payment-failed`,
    };
    console.log(`alipay successful url: ${stripeParams.success_url}`)
    const session = await stripe.checkout.sessions.create(stripeParams);
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error(`[Create Alipay Payment] Error creating Alipay checkout session: ${error}`);
    res.status(500).json({ error: error.toString() });
  }
});

router.post('/create-payment-unionpay', requireJwtAuth, async (req, res) => {
  console.log('Create Union Pay - Start');

  const { userId, paymentReference, planId } = req.body;

  console.log(`Received data: Payment Reference: ${paymentReference}, Plan ID: ${planId}, User ID: ${userId}`);

  if (!planPricing[planId]) {
    console.error('Invalid planId:', planId);
    return res.status(400).json({ error: 'Invalid planId' });
  }

  const priceDetails = planPricing[planId];
  console.log(`Price Details: ${JSON.stringify(priceDetails)}`);

  try {
    // Save the payment reference and user ID for later verification
    console.log('Saving payment reference and user ID');
    await PaymentRefUserId.savePaymentRefUserId({
      paymentReference,
      userId: userId
    });

    const stripeParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: priceDetails.currency,
          product_data: {
            name: `Subscription - ${planId}`,
          },
          unit_amount: priceDetails.price * 100,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseFrontendUrl}/subscription/unionpay-return` +
        `?paymentReference=${paymentReference}` +
        '&paymentMethod=unionpay' +
        `&userId=${userId}` +
        '&sessionId={CHECKOUT_SESSION_ID}' +
        `&planId=${planId}`,
      cancel_url: `${baseFrontendUrl}/subscription/payment-failed`,
    };

    console.log('Creating Stripe checkout session with params:', JSON.stringify(stripeParams));
    const session = await stripe.checkout.sessions.create(stripeParams);
    console.log('Stripe session created successfully:', session.id);

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error(`[Create UnionPay Payment] Error creating UnionPay checkout session: ${error}`);
    res.status(500).json({ error: error.toString() });
  }
});

router.get('/verify-wechatpay', requireJwtAuth, async (req, res) => {
  const { paymentReference, userId, sessionId, planId } = req.query;
  console.log(`plan type is: ${planId}`)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      console.log('[Verify WeChat Pay] Payment status is paid. Processing start and end times.');
      const { subscriptionStartDate, expirationDate } = calcExpiryDate(planId);
      console.log('[Verify WeChat Pay] Calculated subscriptionStartDate and expirationDate:', subscriptionStartDate, expirationDate);

      await createPaymentRecord(
        userId,
        planId,
        session.amount_total / 100, // The amount is unit total, for example cents. So divivision by 100 is needed.
        session.currency,
        session.id,
        paymentReference,
        'wechat_pay',
        session.payment_status,
        subscriptionStartDate,
        expirationDate
      );

      const formattedSubscriptionStartDate = moment(subscriptionStartDate).format('MMM D, YYYY HH:mm:ss');
      const formattedExpirationDate = moment(expirationDate).format('MMM D, YYYY HH:mm:ss');

      res.json({
        status: 'success',
        userId: userId,
        subscriptionStartDate: formattedSubscriptionStartDate,
        expirationDate: formattedExpirationDate
      });
    } else if (session.payment_status === 'unpaid') {
      res.json({ status: 'pending' });
    } else {
      res.json({ status: 'failure' });
    }
  } catch (error) {
    console.error('[Verify WeChat Pay] Error verifying WeChat Pay payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/verify-alipay', requireJwtAuth, async (req, res) => {
  const { paymentReference, userId, sessionId, planId } = req.query;
  console.log(`plan type is: ${planId}`)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const { subscriptionStartDate, expirationDate } = calcExpiryDate(planId);

      await createPaymentRecord(
        userId,
        planId,
        session.amount_total / 100, // The amount is unit total, for example cents. So divivision by 100 is needed.
        session.currency,
        session.id,
        paymentReference,
        'alipay',
        session.payment_status,
        subscriptionStartDate,
        expirationDate
      );

      const formattedSubscriptionStartDate = moment(subscriptionStartDate).format('MMM D, YYYY HH:mm:ss');
      const formattedExpirationDate = moment(expirationDate).format('MMM D, YYYY HH:mm:ss');

      res.json({
        status: 'success',
        userId: userId,
        subscriptionStartDate: formattedSubscriptionStartDate,
        expirationDate: formattedExpirationDate
      });
    } else if (session.payment_status === 'unpaid') {
      res.json({ status: 'pending' });
    } else {
      res.json({ status: 'failure' });
    }
  } catch (error) {
    console.error('[Verify Alipay] Error verifying Alipay payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/verify-unionpay', requireJwtAuth, async (req, res) => {
  const { paymentReference, userId, sessionId, planId } = req.query;
  console.log(`plan type is: ${planId}`)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const { subscriptionStartDate, expirationDate } = calcExpiryDate(planId);

      await createPaymentRecord(
        userId,
        planId,
        session.amount_total / 100, // The amount is unit total, for example cents. So divivision by 100 is needed.
        session.currency,
        session.id,
        paymentReference,
        'unionpay',
        session.payment_status,
        subscriptionStartDate,
        expirationDate
      );

      const formattedSubscriptionStartDate = moment(subscriptionStartDate).format('MMM D, YYYY HH:mm:ss');
      const formattedExpirationDate = moment(expirationDate).format('MMM D, YYYY HH:mm:ss');

      res.json({
        status: 'success',
        userId: userId,
        subscriptionStartDate: formattedSubscriptionStartDate,
        expirationDate: formattedExpirationDate
      });
    } else if (session.payment_status === 'unpaid') {
      res.json({ status: 'pending' });
    } else {
      res.json({ status: 'failure' });
    }
  } catch (error) {
    console.error('[Verify Alipay] Error verifying Union Pay payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// endpoint to get the latest subscription end time for a user
router.get('/subscription-expirationdate/:userId', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find the latest payment for this user
    const latestPayment = await Payment.findOne({ userId: userId }).sort({ expirationDate: -1 });

    if (!latestPayment) {
      return res.status(404).json({ message: 'No subscription found for this user.' });
    }

    const subscriptionDueDime = moment(latestPayment.expirationDate).format('YYYY-MM-DD');
    const planId = latestPayment.planId;

    // Send back the subscription end time
    res.json({ dueTime: subscriptionDueDime, planId: planId });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;