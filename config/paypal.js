require('dotenv').config();
const paypal = require('paypal-rest-sdk');
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

paypal.configure({
  mode: 'sandbox', // change this to 'live' when you're ready
  client_id: clientId,
  client_secret: clientSecret,
});

module.exports = paypal;
