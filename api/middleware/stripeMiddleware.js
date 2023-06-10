require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function updateSubscriptionStatus(subscription) {
  // Add your logic to update subscription status in your database
  console.log(`Updating subscription status for ${subscription.id}`);
}

async function handleSuccessfulPayment(paymentInvoice) {
  // Add your logic to handle successful payments, e.g., update the database, send confirmation emails, etc.
  console.log(`Payment succeeded for invoice ID: ${paymentInvoice.id}`);
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
