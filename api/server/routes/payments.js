require('dotenv').config();
const express = require('express');
const router = express.Router();
const paypal = require('../../../config/paypal.js');
const Payment = require('../../models/payments.js');
const PaymentRefUserId = require('../../models/paymentReference.js'); // Store paymentreference and userID
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const util = require('util');
const singlePaymentTimeTracker = require('../../subscriptionManagement/singlePaymentTimeTracker.js');
const moment = require('moment-timezone');

// Convert callback-based functions to promises
const createPayment = util.promisify(paypal.payment.create).bind(paypal.payment);
const executePayment = util.promisify(paypal.payment.execute).bind(paypal.payment);
const baseUrl = process.env.BASE_URL

router.post('/create-payment', requireJwtAuth, async (req, res) => {
  const paymentReference = req.body.paymentReference;
  console.log(`[Create Payment] Starting - User ID: ${req.user._id}, Payment Reference: ${paymentReference}`);

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
        return_url: `${baseUrl}/subscription/paypal-return?paymentReference=${paymentReference}`,
        cancel_url: `${baseUrl}/subscription/payment-cancelled`
      },
      transactions: [{
        description: 'LibreChat Subscription',
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

router.get('/success', async (req, res) => {
  const { PayerID, paymentId, paymentReference } = req.query;

  try {
    const userSession = await getUserSessionFromReference(paymentReference);
    if (!userSession || !userSession.userId) {
      console.error('[Payment Success] User session not found');
      return res.redirect(`${baseUrl}/subscription/payment-failed`);
    }

    const execute_payment_json = {
      payer_id: PayerID,
      transactions: [{
        amount: {
          currency: 'USD',
          total: '20.00'
        }
      }]
    };

    const executedPayment = await executePayment(paymentId, execute_payment_json);
    const transaction = executedPayment.transactions[0];
    const sale = transaction.related_resources[0].sale;
    // Get the start and end times for the successful payment
    const { startTime, endTime } = singlePaymentTimeTracker();

    // console.log(`userSession before saving paymentRecord: ${JSON.stringify(userSession)}`);
    const paymentRecord = new Payment({
      userId: userSession.userId,
      payerId: PayerID,
      amount: sale.amount.total,
      currency: sale.amount.currency,
      paymentId: paymentId,
      paymentStatus: executedPayment.state,
      paymentReference: paymentReference,
      startTime: startTime, // Added start time
      endTime: endTime// Added end time
    });

    await paymentRecord.save();

    const formattedStartTime = moment(startTime).format('MMM D, YYYY HH:mm:ss');
    const formattedEndTime = moment(endTime).format('MMM D, YYYY HH:mm:ss');

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

    const subscriptionDueDime = moment(latestPayment.endTime).format('MMM D, YYYY');

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

async function getUserSessionFromReference(paymentReference) {
  try {
    const paymentRefUserId = await PaymentRefUserId.findPaymentRefUserId({ paymentReference });
    if (paymentRefUserId) {
      return { userId: paymentRefUserId.userId };
    } else {
      console.error('[getUserSessionFromReference] Payment reference not found.');
      return null;
    }
  } catch (err) {
    console.error(`[getUserSessionFromReference] Error: ${err}`);
    throw err;
  }
}

module.exports = router;