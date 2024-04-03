const User = require('../../../models/User');
const express = require('express');
const router = express.Router();

// Handling POST requests to the webhook endpoint
router.post('/', (req, res) => {
  // Verify the request
  // Process the data
  // Respond immediately to acknowledge receipt
  res.status(200).send('Webhook on /paid has been received and processed.');

  if (req.body.type === 'payment_intent.succeeded') {
    console.log('processing /paid webhook on type=:', req.body.type);
    const paymentIntent = req.body.data.object;
    updateUserOnPaymentSuccess(paymentIntent)
      .then(() => console.log('User successfully updated after payment.'))
      .catch((error) => console.error('Failed to update user after payment:', error));
  } else {
    console.log('skipping /paid webhook on type=:', req.body.type);
    // No need for res.status(200); since it has already been sent
  }
});

async function updateUserOnPaymentSuccess(paymentIntent) {
  if (paymentIntent.receipt_email) {
    console.log('updateUserOnPaymentSuccess() for user', paymentIntent.receipt_email);
    // Find a user by email
    try {
      const user = await User.findOne({ email: paymentIntent.receipt_email });
      if (user) {
        console.log(
          'updating user _id=',
          user._id.toString(),
          ' with additional 30 days professional subscription',
        );
        // update proMemberExpiredAt based on the max of current time and proMemberExpiredAt
        user.proMemberExpiredAt =
          Math.max(user.proMemberExpiredAt, Date.now()) + 31 * 24 * 60 * 60 * 1000;
        await user.save(); // Assuming this also returns a Promise, so it should be awaited.
      } else {
        console.log('User not found for email:', paymentIntent.receipt_email);
      }
    } catch (error) {
      console.error('An error occurred while updating the user:', error);
    }
  } else {
    console.log('updateUserOnPaymentSuccess(): paymentIntent.receipt_email undefined, skip');
  }
}

module.exports = router;
