require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const YOUR_DOMAIN = 'https://gptchina.io'; // Change this to the domain you want to return to after Checkout

async function createCustomer(name, email) {
  const customer = await stripe.customers.create({
    name: name,
    email: email,
  });
  return customer.id;
}

async function cancelSubscription(subscriptionId) {
  const canceledSubscription = await stripe.subscriptions.del(subscriptionId);
  return canceledSubscription;
}

async function createCheckoutSession(priceId, customerId, paymentMethod) {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: [paymentMethod],
    payment_method_options: paymentMethod === 'wechat_pay' ? {
      wechat_pay: {
        client: 'web',
      },
    } : {},
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    mode: paymentMethod === 'wechat_pay' ? 'payment' : 'subscription',
    success_url: `${YOUR_DOMAIN}?success=true`,
    cancel_url: `${YOUR_DOMAIN}?canceled=true`,
  });

  return session.url;
}
module.exports = {
  createCustomer, 
  createCheckoutSession,
  cancelSubscription
};