require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const User = require('../models/User');

async function updateSubscriptionStatus(subscription) {
  // Find the user with the given subscription ID
  let user = await User.findOne({ stripeSubscriptionId: subscription.id });

  // If the user is not found with the subscription ID, find the user with the customer ID
  if (!user) {
    user = await User.findOne({ stripeCustomerId: subscription.customer });
  }

  // Update the user's subscription status
  if (user) {
    await User.findByIdAndUpdate(user._id, {
      subscriptionStatus: subscription.status,
    });
    console.log(`Updated subscription status for User ${user.id}`);
  } else {
    console.log("User not found with the given subscription ID or customer ID.");
  }
}

async function handleSuccessfulPayment(paymentInvoice) {
  // Get Subscription details linked with this invoice
  const subscription = await stripe.subscriptions.retrieve(paymentInvoice.subscription);

  // Get the user to update
  const user = await User.findOne({ stripeCustomerId: subscription.customer });
  console.log("User:", user);

  // Update the user's subscription status and stripeSubscriptionId
  if (user) {
    await User.findByIdAndUpdate(user._id, {
      stripeSubscriptionId: subscription.id, // update stripeSubscriptionId
      subscriptionStatus: subscription.status,
    });

    console.log(`Payment succeeded for invoice ID: ${paymentInvoice.id}`);
  } else {
    console.log("User not found with the given customer ID.");
  }
}

function handleStripeWebhook() {
  return async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    switch (event.type) {
      case "customer.subscription.updated":
        // Existing case for subscription updates
        const subscription = event.data.object;
        if (subscription.status === 'active') {
          await updateSubscriptionStatus(subscription);
        }
        break;
      case "invoice.payment_succeeded":
        // Existing case for successful invoice payments
        const paymentInvoice = event.data.object;
        await handleSuccessfulPayment(paymentInvoice);
        break;
      case "payment_intent.succeeded":
        // New case for successful one-time payments
        const paymentIntent = event.data.object;
        const user = await User.findOne({ stripeCustomerId: paymentIntent.customer });
        if (user) {
          await User.findByIdAndUpdate(user._id, {
            subscriptionStatus: 'active',
          });
          console.log(`Payment succeeded for Payment Intent ID: ${paymentIntent.id}`);
        } else {
          console.log("User not found with the given customer ID.");
        }
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 status to acknowledge receipt of the event
    res.status(200).json({ received: true });
  };
}



module.exports = { handleStripeWebhook };
