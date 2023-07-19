require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const YOUR_DOMAIN = 'http://localhost:3090'; // Change this to the domain you want to return to after Checkout

async function createCustomer(name, email) {
  const customer = await stripe.customers.create({
    name: name,
    email: email,
  });
  return customer.id;
}

async function createCheckoutSession(priceId, customerId) {
  const session = await stripe.checkout.sessions.create({
    customer: customerId, // Add this line
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: `${YOUR_DOMAIN}?success=true`,
    cancel_url: `${YOUR_DOMAIN}?canceled=true`,
    automatic_tax: {enabled: false},
  });

  return session.url; // return the URL of the Checkout session
}

module.exports = {
  createCustomer, // Export createCustomer function
  createCheckoutSession,
};
