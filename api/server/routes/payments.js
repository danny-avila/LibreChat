require('dotenv').config();
const express = require('express');
const router = express.Router();
const paypal = require('../../../config/paypal.js');
const Payment = require('../../models/payments.js');
const PaymentRefUserId = require('../../models/paymentReference.js');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const util = require('util');
const {
  singlePaymentTimeTracker,
  createPaymentRecord,
  getUserSessionFromReference } = require('../../subscriptionManagement/subscriptionUtils.js');
const moment = require('moment-timezone');
const Stripe = require('stripe');

// Convert callback-based functions to promises
const createPayment = util.promisify(paypal.payment.create).bind(paypal.payment);
const executePayment = util.promisify(paypal.payment.execute).bind(paypal.payment);
const baseUrl = process.env.BASE_URL;
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Endpoint for creating PayPal payment
router.post('/create-payment-paypal', requireJwtAuth, async (req, res) => {
  const paymentReference = req.body.paymentReference;
  console.log(`[Create PayPal Payment] Starting - User ID: ${req.user._id}, Payment Reference: ${paymentReference}`);

  try {
    await PaymentRefUserId.savePaymentRefUserId({
      paymentReference,
      userId: req.user._id
    });

    const paymentDetails = {
      intent: 'sale',
      payer: {
        payment_method: 'paypal'
      },
      redirect_urls: {
        return_url: `${baseUrl}/subscription/paypal-return?paymentReference=${paymentReference}&paymentMethod=paypal`,
        cancel_url: `${baseUrl}/subscription/payment-cancelled`
      },
      transactions: [{
        description: 'AItok Subscription',
        custom: paymentReference,
        amount: {
          currency: 'USD',
          total: '20.00'
        }
      }]
    };

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
  const paymentReference = req.body.paymentReference;

  const userId = req.user._id;

  await PaymentRefUserId.savePaymentRefUserId({
    paymentReference,
    userId: userId
  });

  try {
    console.log('[Create WeChat Pay Payment] Creating Stripe Checkout Session');

    // Log the parameters being sent to Stripe
    const stripeParams = {
      payment_method_types: ['wechat_pay'],
      payment_method_options: {
        wechat_pay: { client: 'web' },
      },
      line_items: [{
        price_data: {
          currency: 'cny',
          product_data: {
            name: 'Subscription',
          },
          unit_amount: 14000,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/subscription/wechat-return` +
        `?paymentReference=${paymentReference}` +
        '&paymentMethod=wechatpay' +
        `&userId=${userId}` +
        '&sessionId={CHECKOUT_SESSION_ID}',
      cancel_url: `${baseUrl}/subscription/payment-failed`,
    };

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create(stripeParams);
    const sessionId = session.id
    console.log('[Create WeChat Pay Payment] Stripe Checkout Session parameters:', JSON.stringify(stripeParams));

    // Log the successful creation of the session
    console.log(`[Create WeChat Pay Payment] Stripe Checkout Session Created: Session ID - ${sessionId}`);
    res.json({ sessionId: session.id });
  } catch (error) {
    // Log the error details
    console.error(`[Create WeChat Pay Payment] Error creating WeChat Pay checkout session: ${error}`);
    res.status(500).json({ error: error.toString() });

    // Additional log for debugging
    console.error('[Create WeChat Pay Payment] Full error stack:', error.stack);
  }
});

// Alipay Endpoint
router.post('/create-payment-alipay', requireJwtAuth, async (req, res) => {
  const paymentReference = req.body.paymentReference;
  console.log('[Create Alipay Payment] Request received');

  const userId = req.user._id;
  await PaymentRefUserId.savePaymentRefUserId({
    paymentReference,
    userId: userId
  });

  try {
    console.log('[Create Alipay Payment] Creating Stripe Checkout Session');

    const stripeParams = {
      payment_method_types: ['alipay'],
      line_items: [{
        price_data: {
          currency: 'cny',
          product_data: {
            name: 'Subscription',
          },
          unit_amount: 14000,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/subscription/alipay-return` +
        `?paymentReference=${paymentReference}` +
        '&paymentMethod=alipay' +
        `&userId=${userId}` +
        '&sessionId={CHECKOUT_SESSION_ID}',
      cancel_url: `${baseUrl}/subscription/payment-failed`,
    };

    const session = await stripe.checkout.sessions.create(stripeParams);
    const sessionId = session.id;
    console.log('[Create Alipay Payment] Stripe Checkout Session parameters:', JSON.stringify(stripeParams));

    console.log(`[Create Alipay Payment] Stripe Checkout Session Created: Session ID - ${sessionId}`);
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error(`[Create Alipay Payment] Error creating Alipay checkout session: ${error}`);
    res.status(500).json({ error: error.toString() });
    console.error('[Create Alipay Payment] Full error stack:', error.stack);
  }
});

router.get('/verify-wechatpay', requireJwtAuth, async (req, res) => {
  const { userId, paymentReference, sessionId } = req.query;

  try {
    console.log('[Verify WeChat Pay] Retrieving Stripe session for ID:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.log('[Verify WeChat Pay] Stripe session retrieved:', session);

    if (session.payment_status === 'paid') {
      console.log('[Verify WeChat Pay] Payment status is paid. Processing start and end times.');
      const { startTime, endTime } = singlePaymentTimeTracker();

      console.log('[Verify WeChat Pay] Calculated startTime and endTime:', startTime, endTime);

      // Assuming getUserSessionFromReference is a function to retrieve user session details
      console.log('[Verify WeChat Pay] Retrieving user session from reference');
      const userSession = await getUserSessionFromReference(paymentReference);

      console.log('[Verify WeChat Pay] User session found:', userSession);

      await createPaymentRecord(
        userId,
        'wechat_pay',
        session.id,
        session.amount_total,
        session.currency,
        startTime,
        endTime
      );

      const formattedStartTime = moment(startTime).format('MMM D, YYYY HH:mm:ss');
      const formattedEndTime = moment(endTime).format('MMM D, YYYY HH:mm:ss');

      console.log('[Verify WeChat Pay] Sending success response');
      res.json({
        status: 'success',
        userId: userId,
        startTime: formattedStartTime,
        endTime: formattedEndTime
      });
    } else if (session.payment_status === 'unpaid') {
      console.log('[Verify WeChat Pay] Payment status is unpaid.');
      res.json({ status: 'pending' });
    } else {
      console.log('[Verify WeChat Pay] Payment status is failure.');
      res.json({ status: 'failure' });
    }
  } catch (error) {
    console.error('[Verify WeChat Pay] Error verifying WeChat Pay payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/verify-alipay', requireJwtAuth, async (req, res) => {
  const { userId, paymentReference, sessionId } = req.query;

  try {
    console.log('[Verify Alipay] Retrieving Stripe session for ID:', sessionId);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.log('[Verify Alipay] Stripe session retrieved:', session);

    if (session.payment_status === 'paid') {
      console.log('[Verify Alipay] Payment status is paid. Processing start and end times.');
      const { startTime, endTime } = singlePaymentTimeTracker();

      console.log('[Verify Alipay] Calculated startTime and endTime:', startTime, endTime);

      console.log('[Verify Alipay] Retrieving user session from reference');
      const userSession = await getUserSessionFromReference(paymentReference);

      console.log('[Verify Alipay] User session found:', userSession);

      await createPaymentRecord(
        userId,
        'alipay',
        session.id,
        session.amount_total,
        session.currency,
        startTime,
        endTime
      );

      const formattedStartTime = moment(startTime).format('MMM D, YYYY HH:mm:ss');
      const formattedEndTime = moment(endTime).format('MMM D, YYYY HH:mm:ss');

      console.log('[Verify Alipay] Sending success response');
      res.json({
        status: 'success',
        userId: userId,
        startTime: formattedStartTime,
        endTime: formattedEndTime
      });
    } else if (session.payment_status === 'unpaid') {
      console.log('[Verify Alipay] Payment status is unpaid.');
      res.json({ status: 'pending' });
    } else {
      console.log('[Verify Alipay] Payment status is failure.');
      res.json({ status: 'failure' });
    }
  } catch (error) {
    console.error('[Verify Alipay] Error verifying Alipay payment:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/success', async (req, res) => {
  const { paymentMethod, PayerID, paymentId, paymentReference } = req.query;

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

    console.log(`[Payment Success] User session retrieved for userId: ${userSession.userId}`);

    let executedPayment, transaction, sale, startTime, endTime;

    switch(paymentMethod) {
      case 'paypal': {
        console.log('[Payment Success] Processing PayPal payment');

        const execute_payment_json = {
          payer_id: PayerID,
          transactions: [{ amount: { currency: 'USD', total: '20.00' } }]
        };

        executedPayment = await executePayment(paymentId, execute_payment_json);
        transaction = executedPayment.transactions[0];
        sale = transaction.related_resources[0].sale;
        ({ startTime, endTime } = singlePaymentTimeTracker());

        console.log('[Payment Success] PayPal payment executed', executedPayment);
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
      startTime,
      endTime
    );

    const formattedStartTime = moment(startTime).format('MMM D, YYYY HH:mm:ss');
    const formattedEndTime = moment(endTime).format('MMM D, YYYY HH:mm:ss');

    console.log(
      `[Payment Success] Payment processed successfully for userId: ${userSession.userId}, ` +
      `paymentId: ${paymentId}`
    );

    res.json({
      status: 'success',
      paymentId: paymentId,
      userId: userSession.userId,
      startTime: formattedStartTime,
      endTime: formattedEndTime
    });
  } catch (error) {
    console.error(`[Payment Success] Execution failed: ${error}, Response: ${error.response}`);
  }
});

// endpoint to get the latest subscription end time for a user
router.get('/subscription-endtime/:userId', requireJwtAuth, async (req, res) => {
  try {
    const userId = req.params.userId;

    // Find the latest payment for this user
    const latestPayment = await Payment.findOne({ userId: userId }).sort({ endTime: -1 });

    if (!latestPayment) {
      return res.status(404).json({ message: 'No subscription found for this user.' });
    }

    const subscriptionDueDime = moment(latestPayment.endTime).format('YYYY-MM-DD');

    // Send back the subscription end time
    res.json({ dueTime: subscriptionDueDime });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/cancel', (req, res) => {
  console.log('[Payment Cancelled] Payment cancelled by user.');
  res.redirect(`${baseUrl}/subscription/payment-cancelled`);
});

module.exports = router;