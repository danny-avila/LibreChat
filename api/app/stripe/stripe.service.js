require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function createCustomer(name, email) {
  return await stripe.customers.create({ name, email });
}

async function createSubscription(customerId, priceId) {
  return await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    expand: ["latest_invoice.payment_intent"],
  });
}

async function cancelSubscription(subscriptionId) {
  return await stripe.subscriptions.del(subscriptionId);
}

async function updatePaymentMethod(customerId, paymentMethodId) {
  const customer = await stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
  return await stripe.PaymentMethod.attach(paymentMethodId, {
    customer: customer.id,
  });
}

module.exports = {
  createCustomer,
  createSubscription,
  cancelSubscription,
  updatePaymentMethod,
};
