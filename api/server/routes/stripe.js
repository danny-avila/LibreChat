const express = require('express');
const router = express.Router();
// Import Stripe-related functions/controllers from the 'app/stripe/stripe.service.js' file
const {
  createCustomer,
  createSubscription,
  cancelSubscription,
  updatePaymentMethod
} = require('../../app/stripe/stripe.service'); 

// Add necessary Stripe-related endpoints
router.post('/create-customer', async (req, res) => {
  const { name, email } = req.body;
  try {
    const customer = await createCustomer(name, email);
    res.status(200).send(customer);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

router.post('/create-subscription', async (req, res) => {
  const { customerId, priceId } = req.body;
  try {
    const subscription = await createSubscription(customerId, priceId);
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
  try {
    const updatedCustomer = await updatePaymentMethod(customerId, paymentMethodId);
    res.status(200).send(updatedCustomer);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

module.exports = router;
