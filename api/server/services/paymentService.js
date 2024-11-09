// services/paymentService.js
const ZarinPal = require('~/lib/utils/zarinpal');
const Payment = require('~/models/Payment');
const Subscription = require('~/models/Subscription'); // Import the Subscription model
const SubscriptionPlan = require('~/models/SubscriptionPlan'); // Import the SubscriptionPlan model
const { logger } = require('~/config');
const mongoose = require('mongoose');
const Balance = require('~/models/Balance');

// Create ZarinPal instance with Merchant ID and Sandbox Mode
const zarinpal = ZarinPal.create(
  process.env.ZARINPAL_MERCHANT_ID,
  process.env.ZARINPAL_SANDBOX === 'true',
);

/**
 * Initiates a payment request to ZarinPal.
 *
 * @param {Object} paymentDetails - The payment details including user ID, subscription plan ID, amount, callback URL, description, email, and mobile.
 * @returns {Promise<Object>} - The payment URL and authority.
 */
const initiatePayment = async ({ userId, subscriptionPlanId, amount, callbackUrl, description, email, mobile }) => {
  try {
    const response = await zarinpal.PaymentRequest({
      Amount: amount,
      CallbackURL: callbackUrl,
      Description: description,
      Email: email,
      Mobile: mobile,
    });

    if (response.status === 100) {
      // Create new payment record in the database
      const payment = new Payment({
        userId: new mongoose.Types.ObjectId(userId),
        subscriptionPlanId: new mongoose.Types.ObjectId(subscriptionPlanId),
        amount: amount,
        transactionId: response.authority,
        provider: 'zarinpal',
        status: 'pending',
        callbackUrl,
      });
      await payment.save();

      return { url: response.url, authority: response.authority };
    } else {
      throw new Error(`Payment initiation failed with status ${response.status}`);
    }
  } catch (error) {
    logger.error('[PaymentService] Initiate Payment Error:', error);
    throw error;
  }
};

/**
 * Verifies the payment with ZarinPal.
 *
 * @param {Object} verificationDetails - The verification details including authority.
 * @returns {Promise<Object>} - The verification result.
 */
const verifyPayment = async ({ authority }) => {
  try {
    // Find the payment record by authority (transactionId)
    const paymentRecord = await Payment.findOne({ transactionId: authority });
    if (!paymentRecord) {
      throw new Error('Payment record not found for verification');
    }

    // Extract amount from the found payment record
    const amount = paymentRecord.amount;
    const transactionId = paymentRecord.transactionId;

    // Perform verification with ZarinPal
    const response = await zarinpal.PaymentVerification({
      Amount: amount,
      Authority: transactionId,
    });

    if (response.status === 100 && response.message === 'Paid') {
      // Update payment status to 'paid' with the reference ID
      const updatedPayment = await Payment.findOneAndUpdate(
        { transactionId: authority },
        { status: 'paid', refId: response.refId },
        { new: true },
      );

      if (!updatedPayment) {
        throw new Error('Failed to update payment record after successful verification');
      }

      // Fetch the subscription plan
      const subscriptionPlan = await SubscriptionPlan.findOne({id: paymentRecord.subscriptionPlanId});
      if (!subscriptionPlan) {
        throw new Error('Subscription plan not found');
      }

      // Calculate subscription end date based on plan duration
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + subscriptionPlan.durationInDays);

      // Create a new subscription for the user
      const subscription = new Subscription({
        user: paymentRecord.userId,
        subscriptionPlan: subscriptionPlan._id,
        startDate,
        endDate,
        isActive: true,
      });
      await subscription.save();

      // Update the user's balance with the token credits from the subscription plan
      const balanceRecord = await Balance.findOneAndUpdate(
        { user: paymentRecord.userId },
        { $inc: { tokenCredits: subscriptionPlan.tokenCredits } },
        { new: true, upsert: true }, // Creates a new balance record if it doesn't exist
      );

      if (!balanceRecord) {
        throw new Error('Failed to update user balance');
      }

      logger.info(`[PaymentService] User ${paymentRecord.userId} balance updated with ${subscriptionPlan.tokenCredits} tokens.`);

      return { success: true, refId: response.refId };
    } else {
      // Mark payment as failed if verification was unsuccessful
      await Payment.findOneAndUpdate(
        { transactionId: authority },
        { status: 'failed' },
        { new: true },
      );

      return { success: false, message: 'Payment verification failed' };
    }
  } catch (error) {
    logger.error('[PaymentService] Verify Payment Error:', error);
    throw error;
  }
};

module.exports = {
  initiatePayment,
  verifyPayment,
};
