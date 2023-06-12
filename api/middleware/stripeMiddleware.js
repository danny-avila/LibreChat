require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
const User = require('../models/User');

async function updateSubscriptionStatus(subscription) {
  // Find the user with the given subscription ID
  const user = await User.findOne({ stripeSubscriptionId: subscription.id });

  // Update the user's subscription status
  if (user) {
    await User.findByIdAndUpdate(user._id, {
      subscriptionStatus: subscription.status,
    });
    console.log(`Updated subscription status for User ${user.id}`);
  } else {
    console.log("User not found with the given subscription ID.");
  }
}

async function handleSuccessfulPayment(paymentInvoice) {
  // Get Subscription details linked with this invoice
  const subscription = await stripe.subscriptions.retrieve(paymentInvoice.subscription);

  // Get the user to update
  const user = await User.findOne({ stripeSubscriptionId: subscription.id });

  // Update the user's subscription status
  if (user) {
    await User.findByIdAndUpdate(user._id, {
      subscriptionStatus: subscription.status,
    });

    console.log(`Payment succeeded for invoice ID: ${paymentInvoice.id}`);
  } else {
    console.log("User not found with the given subscription ID.");
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
      case "customer.subscription.deleted":
        {
          const subscription = event.data.object;
          await updateSubscriptionStatus(subscription);
        }
        break;
      case "invoice.payment_succeeded":
        {
          const paymentInvoice = event.data.object;
          await handleSuccessfulPayment(paymentInvoice);
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
