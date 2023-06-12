const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { handleStripeWebhook } = require('../../middleware/stripeMiddleware');
const {
  createCustomer,
  createSubscription,
  cancelSubscription,
  updatePaymentMethod
} = require('../../app/stripe/stripe.service');

// Add necessary Stripe-related endpoints
router.post('/create-customer', async (req, res) => {
  const { name, email, id } = req.body; // Update: Include user id in request
  try {
    const customerId = await createCustomer(name, email); // Update: Get customerId instead of customer object
    // Update user data with stripeCustomerId
    await User.findByIdAndUpdate(id, { stripeCustomerId: customerId });
    // Return customerId in response
    res.status(200).send({ id: customerId });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});
  

router.post('/create-subscription', async (req, res) => {
  const { customerId, priceId, userId } = req.body; // Update: Include user id in request
  
  try {
    const subscription = await createSubscription(customerId, priceId);
  
    // Update user data with stripeSubscriptionId and subscriptionStatus
    await User.findByIdAndUpdate(userId, {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    });
  
    res.status(200).send(subscription);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});
  

router.post('/cancel-subscription', async (req, res) => {
  const { subscriptionId } = req.body;
  try {
    const canceledSubscription = await cancelSubscription(subscriptionId);
    res.status(200).send(canceledSubscription);
  } catch (error) {
    res.status(400).send({ error: error.message });
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


router.post('/webhook', handleStripeWebhook());

module.exports = router;
