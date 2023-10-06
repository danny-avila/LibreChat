const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// const UserId = require('../../models/User');  // Adjust the path to your User Model
const addTokens = require('../../../config/addTokens'); // Import the addTokens function

exports.createPaymentIntent = async (req, res) => {
  try {
    //   const { amount, userId } = req.body;
    const { amount } = req.body;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Tokens',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'http://localhost:3090',
      cancel_url: 'http://localhost:3090',
    });
    res.status(200).json({ sessionId: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.handleWebhook = async (req, res) => {
  const sigHeader = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sigHeader, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event['type'] === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email; // Assume you've collected and stored the customer's email in Stripe
    const amount = session.amount_total / 100; // Convert amount to tokens based on your conversion logic

    try {
      const newBalance = await addTokens(email, amount);
      res.status(200).send(`Success! New balance is ${newBalance}`);
    } catch (error) {
      res.status(500).send({ error: `Error updating balance: ${error.message}` });
    }
  } else {
    // Handle other types of events or ignore them
    res.status(200).send();
  }
};
