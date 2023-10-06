// controllers/PaymentController.js

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../../models/User'); // Adjust the path to your User Model

exports.createPaymentIntent = async (req, res) => {
  try {
    const { amount, userId } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd', // Adjust currency if necessary
      metadata: { userId }, // Store userId in metadata
    });
    res.status(200).json({ client_secret: paymentIntent.client_secret });
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

  if (event['type'] === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object; // Contains a paymentIntent object
    const userId = paymentIntent.metadata.userId; // Retrieve userId from metadata

    if (!userId) {
      return res.status(400).send('User ID not found in paymentIntent metadata');
    }

    try {
      const user = await User.findById(userId);
      const tokens = paymentIntent.amount / 100; // Adjust this line to your conversion logic
      user.freeMessages += tokens; // Adjust this line to your balance field and conversion logic
      await user.save();

      res.status(200).send('Payment handled successfully');
    } catch (error) {
      res.status(500).send({
        error: `Error updating balance: ${error.message}`,
      });
    }
  } else {
    // Handle other types of events or ignore them
    res.status(200).send();
  }
};
