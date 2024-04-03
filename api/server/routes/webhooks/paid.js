const express = require('express');
const router = express.Router();
const User = require('../../../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const endpointSecret = process.env.STRIPE_ENDPOINT_SECRET;

// Modified endpoint using async/await
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed, Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'payment_intent.succeeded') {
    console.log('Processing /paid webhook on type=:', event.type);
    const paymentIntent = event.data.object;

    try {
      const updatedUserEmail = await updateUserOnPaymentSuccess(paymentIntent);
      if (updatedUserEmail) {
        console.log(`User with email ${updatedUserEmail} successfully updated after payment.`);
        return res
          .status(200)
          .send(`User with email ${updatedUserEmail} successfully updated after payment.`);
      } else {
        console.log('User could not be updated because email was not found.');
        return res.status(404).send('User with given email not found.');
      }
    } catch (error) {
      console.error(`Failed to update user after payment: ${error}`);
      return res.status(500).send('Internal Server Error');
    }
  } else {
    console.log('Skipping /paid webhook on type=:', event.type);
    return res.status(200).send(`Unhandled event type ${event.type}`);
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
        return user.email;
      } else {
        console.log('User not found for email:', paymentIntent.receipt_email);
        return null;
      }
    } catch (error) {
      console.error('An error occurred while updating the user:', error);
    }
  } else {
    console.log('updateUserOnPaymentSuccess(): paymentIntent.receipt_email undefined, skip');
    return null;
  }
}

module.exports = router;
