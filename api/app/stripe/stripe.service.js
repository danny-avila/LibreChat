require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

async function createCustomer(name, email) {
  const customer = await stripe.customers.create({
    name,
    email,
  });

  return customer.id; // return the created customer ID
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
  try {
    // Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    console.log("Payment Method Attached:", paymentMethodId);

    // Update the customer's invoice settings to use the attached payment method
    const customer = await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    console.log("Customer Updated:", customer);
    return customer;

  } catch (error) {
    console.error("Stripe Error:", error);
    throw error;
  }
}



module.exports = {
  createCustomer,
  createSubscription,
  cancelSubscription,
  updatePaymentMethod,
};
