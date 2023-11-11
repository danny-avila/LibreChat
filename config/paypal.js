require('dotenv').config();
const paypal = require('paypal-rest-sdk');

const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const mode = process.env.PAYPAL_MODE || 'sandbox'; // Default to 'sandbox' if not set

if (!clientId || !clientSecret) {
  throw new Error('PayPal credentials are not set in environment variables.');
}

paypal.configure({
  mode: mode, // 'sandbox' or 'live'
  client_id: clientId,
  client_secret: clientSecret,
});

module.exports = paypal;
