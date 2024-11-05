const paymentService = require('~/server/services/paymentService');
const Payment = require('~/models/Payment'); // Import Payment model

/**
 * Handles the initiation of a payment.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
const initiatePaymentController = async (req, res) => {
  try {
    const { amount, callbackUrl, description, email, mobile } = req.body;

    const result = await paymentService.initiatePayment({
      amount,
      callbackUrl,
      description,
      email,
      mobile,
    });

    res.status(200).json({
      message: 'Payment initiated successfully',
      paymentUrl: result.url,
      authority: result.authority,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to initiate payment', error: error.message });
  }
};

/**
 * Handles the verification of a payment.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
const verifyPaymentController = async (req, res) => {
  try {
    const { amount, authority } = req.body;

    const result = await paymentService.verifyPayment({ amount, authority });

    if (result.success) {
      res.status(200).json({
        message: 'Payment verified successfully',
        refId: result.refId,
        success: result.success,
      });
    } else {
      res.status(400).json({ message: result.message, success: result.success });
    }
  } catch (error) {
    res.status(500).json({ message: 'Failed to verify payment', error: error.message });
  }
};

/**
 * Retrieves the payment history for the authenticated user.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
const getUserPaymentHistoryController = async (req, res) => {
  try {
    const userId = req.user.id; // Assuming user ID is available from authentication middleware

    // Fetch payment history for the user, sorted by most recent first
    const payments = await Payment.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json({
      message: 'Payment history retrieved successfully',
      payments,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve payment history', error: error.message });
  }
};

module.exports = {
  initiatePaymentController,
  verifyPaymentController,
  getUserPaymentHistoryController, // Export the new controller
};
