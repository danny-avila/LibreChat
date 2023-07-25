const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { handleStripeWebhook } = require('../../middleware/stripeMiddleware');
const {
  createCustomer,
  createSubscription,
  cancelSubscription,
  updatePaymentMethod,
  createCheckoutSession
} = require('../../app/stripe/stripe.service');

// Add necessary Stripe-related endpoints
router.post('/create-customer', async (req, res) => {
  console.log("Request Body:", req.body);
  const { name, email, id } = req.body; // Include user id in request
  try {
    const customerId = await createCustomer(name, email); // Get customerId instead of customer object
    // Update user data with stripeCustomerId
    await User.findByIdAndUpdate(id, { stripeCustomerId: customerId });
    // Return customerId in response
    res.status(200).send({ id: customerId });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

router.post('/create-subscription', async (req, res) => {
  const { customerId, priceId, userId } = req.body; // Include user id in request
  console.log("Request Body:", req.body);
  
  try {
    const subscription = await createSubscription(userId, priceId);
  
    // Update user data with stripeSubscriptionId and subscriptionStatus
    await User.findByIdAndUpdate(userId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    }, { new: true });  // Add { new: true } to return the updated document
  
    res.status(200).send(subscription);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});


router.post('/cancel-subscription', async (req, res) => {
  const { subscriptionId } = req.body;
  try {
    console.log("Request Body:", req.body);
    const canceledSubscription = await cancelSubscription(subscriptionId);

    // Fetch the user by stripeSubscriptionId
    const user = await User.findOne({ stripeSubscriptionId: subscriptionId });

    // Update the subscriptionStatus
    if (user) {
      user.subscriptionStatus = 'canceled';
      await user.save();
    }

    res.status(200).send(canceledSubscription);
  } catch (error) {
    console.error("Error:", error);
    // Send the entire error in the response
    res.status(400).send({ error: error });
  }
});

router.post('/update-payment-method', async (req, res) => {
  const { customerId, paymentMethodId } = req.body;
    
  console.log("Request body:", req.body); // Add this line
    
  try {
    const updatedCustomer = await updatePaymentMethod(customerId, paymentMethodId);
    res.status(200).send(updatedCustomer);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

router.post('/create-checkout-session', async (req, res) => {
  const { priceId, customerId, paymentMethod } = req.body;
  try {
    const sessionUrl = await createCheckoutSession(priceId, customerId, paymentMethod);
    res.status(200).send({ url: sessionUrl });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});



router.post('/webhook', handleStripeWebhook());

module.exports = router;
