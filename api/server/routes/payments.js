require('dotenv').config();
const express = require('express');
const router = express.Router();
const paypal = require('../../../config/paypal.js');
const Payment = require('../../models/payments.js');
const PaymentRefUserId = require('../../models/paymentReference.js');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const util = require('util');
const {
  calcExpiryDate,
  createPaymentRecord,
  getUserSessionFromReference } = require('../../subscriptionManagement/subscriptionUtils.js');
const moment = require('moment-timezone');
const Stripe = require('stripe');

// Convert callback-based functions to promises
const createPayment = util.promisify(paypal.payment.create).bind(paypal.payment);
const executePayment = util.promisify(paypal.payment.execute).bind(paypal.payment);
const baseUrl = process.env.BASE_URL;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// planPricing
const planPricing = {
  month: {
    price: '120.00',
    currency: 'USD'
  },
  quarter: {
    price: '320.00',
    currency: 'CNY'
  },
  year: {
    price: '1100.00',
    currency: 'CNY'
  }
};

// Endpoint for creating PayPal payment
router.post('/create-payment-paypal', requireJwtAuth, async (req, res) => {
  const { paymentReference, planId } = req.body;
  const userId = req.user._id;

  if (!planPricing[planId]) {
    return res.status(400).json({ error: 'Invalid planId' });
  }

  const priceDetails = planPricing[planId];

  try {
    await PaymentRefUserId.savePaymentRefUserId({ paymentReference, userId });

    const paymentDetails = {
      intent: 'sale',
      payer: {
        payment_method: 'paypal'
      },
      redirect_urls: {
        return_url: `${baseUrl}/subscription/paypal-return?paymentReference=${paymentReference}&paymentMethod=paypal` +
          `&planId=${planId}`,
        cancel_url: `${baseUrl}/subscription/payment-cancelled`
      },
      transactions: [{
        description: `Subscription - ${planId}`,
        custom: paymentReference,
        amount: {
          currency: priceDetails.currency,
          total: priceDetails.price
        }
      }]
    };

    console.log(`paypal return url: ${paymentDetails.return_url}`)

    const paymentResult = await createPayment(paymentDetails);
    let approvalUrl = paymentResult.links.find(link => link.rel === 'approval_url');
    if (approvalUrl) {
      console.log(`[Create Payment] Successful - Approval URL: ${approvalUrl.href}`);
      console.log(`[requireJwtAuth] Authentication successful for user after Approval URL: ${req.user.id}`);
      res.json({ approval_url: approvalUrl.href });
    } else {
      console.warn('[Create Payment] No approval URL found after payment creation');
      res.status(500).json({ error: 'No approval URL found' });
    }
  } catch (error) {
    console.error(`[Create Payment] Exception occurred: ${error}`);
    res.status(500).json({ error: error.toString() });
  }
});

// Endpoint for creating WeChat Pay payment
router.post('/create-payment-wechatpay', requireJwtAuth, async (req, res) => {
  const { paymentReference, planId } = req.body;
  const userId = req.user._id;

  if (!planPricing[planId]) {
    return res.status(400).json({ error: 'Invalid planId' });
  }

  const priceDetails = planPricing[planId];

  await PaymentRefUserId.savePaymentRefUserId({
    paymentReference,
    userId: userId
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
          unit_amount: parseInt(priceDetails.price * 100), // Convert to smallest currency unit, e.g., cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/subscription/wechat-return` +
        `?paymentReference=${paymentReference}` +
        '&paymentMethod=wechatpay' +
        `&userId=${userId}` +
        '&sessionId={CHECKOUT_SESSION_ID}' +
        `&planId=${planId}`,
      cancel_url: `${baseUrl}/subscription/payment-failed`,
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
  const { paymentReference, planId } = req.body;
  const userId = req.user._id;

  if (!planPricing[planId]) {
    return res.status(400).json({ error: 'Invalid planId' });
  }

  const priceDetails = planPricing[planId];

  await PaymentRefUserId.savePaymentRefUserId({
    paymentReference,
    userId: userId
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
          unit_amount: parseInt(priceDetails.price * 100), // Convert to smallest currency unit
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/subscription/alipay-return` +
        `?paymentReference=${paymentReference}` +
        '&paymentMethod=alipay' +
        `&userId=${userId}` +
        '&sessionId={CHECKOUT_SESSION_ID}' +
        `&planId=${planId}`,
      cancel_url: `${baseUrl}/subscription/payment-failed`,
    };
    console.log(`alipay successful url: ${stripeParams.success_url}`)
    const session = await stripe.checkout.sessions.create(stripeParams);
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error(`[Create Alipay Payment] Error creating Alipay checkout session: ${error}`);
    res.status(500).json({ error: error.toString() });
  }
});

router.get('/verify-wechatpay', requireJwtAuth, async (req, res) => {
  const { userId, sessionId, planId } = req.query;
  console.log(`plan type is: ${planId}`)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      console.log('[Verify WeChat Pay] Payment status is paid. Processing start and end times.');
      const { subscriptionStartDate, expirationDate } = calcExpiryDate(planId);
      console.log('[Verify WeChat Pay] Calculated subscriptionStartDate and expirationDate:', subscriptionStartDate, expirationDate);
      // const userSession = await getUserSessionFromReference(paymentReference);

      // console.log('[Verify WeChat Pay] User session found:', userSession);

      await createPaymentRecord(
        userId,
        'wechat_pay',
        session.id,
        session.amount_total,
        session.currency,
        planId,
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
  const { userId, sessionId, planId } = req.query;
  console.log(`plan type is: ${planId}`)

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') {
      const { subscriptionStartDate, expirationDate } = calcExpiryDate(planId);

      await createPaymentRecord(
        userId,
        'alipay',
        session.id,
        session.amount_total,
        session.currency,
        planId,
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

router.get('/success', async (req, res) => {
  const { paymentMethod, PayerID, paymentId, paymentReference, planId } = req.query;
  console.log(`plan type is: ${planId}`)

  console.log(
    `[Payment Success] Start processing with paymentMethod: ${paymentMethod},` +
    ` PayerID: ${PayerID},` +
    ` paymentId: ${paymentId},` +
    ` paymentReference: ${paymentReference}`
  );

  try {
    const userSession = await getUserSessionFromReference(paymentReference);
    if (!userSession || !userSession.userId) {
      console.error('[Payment Success] User session not found');
      return res.redirect(`${baseUrl}/subscription/payment-failed`);
    }

    let executedPayment, transaction, sale, subscriptionStartDate, expirationDate;

    switch(paymentMethod) {
      case 'paypal': {
        const execute_payment_json = {
          payer_id: PayerID,
          transactions: [{ amount: { currency: 'USD', total: '20.00' } }]
        };

        executedPayment = await executePayment(paymentId, execute_payment_json);
        transaction = executedPayment.transactions[0];
        sale = transaction.related_resources[0].sale;
        ({ subscriptionStartDate, expirationDate } = calcExpiryDate(planId));
        break;
      }

      default:
        console.error(`Unsupported payment method: ${paymentMethod}`);
        return res.redirect(`${baseUrl}/subscription/payment-failed`);
    }

    await createPaymentRecord(
      userSession.userId,
      paymentMethod,
      paymentId,
      sale.amount.total,
      sale.amount.currency,
      planId,
      subscriptionStartDate,
      expirationDate
    );

    const formattedSubscriptionStartDate = moment(subscriptionStartDate).format('MMM D, YYYY HH:mm:ss');
    const formattedExpirationDate = moment(expirationDate).format('MMM D, YYYY HH:mm:ss');

    console.log(
      `[Payment Success] Payment processed successfully for userId: ${userSession.userId}, ` +
      `paymentId: ${paymentId}`
    );

    res.json({
      status: 'success',
      paymentId: paymentId,
      userId: userSession.userId,
      subscriptionStartDate: formattedSubscriptionStartDate,
      expirationDate: formattedExpirationDate
    });
  } catch (error) {
    console.error(`[Payment Success] Execution failed: ${error}, Response: ${error.response}`);
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

    // Send back the subscription end time
    res.json({ dueTime: subscriptionDueDime });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/cancel', (req, res) => {
  res.redirect(`${baseUrl}/subscription/payment-cancelled`);
});

module.exports = router;