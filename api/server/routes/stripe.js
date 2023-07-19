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
  const { subscriptionId } = req.body; // Pass necessary data from frontend
  try {
    console.log("Request Body:", req.body); // Log request body
    const canceledSubscription = await cancelSubscription(subscriptionId);
    res.status(200).send(canceledSubscription);
  } catch (error) {
    console.error("Error:", error); // Log error details
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

// New route to handle Checkout Session creation
router.post('/create-checkout-session', async (req, res) => {
  console.log("Request body:", req.body);
  const { priceId, customerId, userId } = req.body;
  try {
    const sessionUrl = await createCheckoutSession(priceId, customerId);
    res.status(200).send({ url: sessionUrl }); // Send the Checkout session URL
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});


router.post('/webhook', handleStripeWebhook());

module.exports = router;
