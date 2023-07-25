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

    // Reflect the changes in oneTimePaymentPlan field if it's a one-time payment
    if(subscription.status === 'active' && subscription.collection_method === 'charge_automatically') {
      await User.findByIdAndUpdate(user._id, {
        oneTimePaymentPlan: 'active',
      });
    }

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

  // Update the user's subscription status and stripeSubscriptionId
  if (user) {
    await User.findByIdAndUpdate(user._id, {
      stripeSubscriptionId: subscription.id,
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
        const subscription = event.data.object;
        await updateSubscriptionStatus(subscription);
        break;

      case "invoice.payment_succeeded":
        const paymentInvoice = event.data.object;
        await handleSuccessfulPayment(paymentInvoice);
        break;

      case "checkout.session.completed":
        const session = event.data.object;
        if (session.payment_method_types[0] === 'wechat_pay') {
          const user = await User.findOne({ stripeCustomerId: session.customer });
          if (user) {
            const priceId = session.success_url.split('priceId=')[1];
            let subscriptionStatus;
            switch (priceId) {
              case 'price_1NVfOMHKD0byXXCllGN0MBlN':
                subscriptionStatus = 'pro_year';
                break;
              case 'price_1NVfO3HKD0byXXCld3XFHMOj':
                subscriptionStatus = 'pro_month';
                break;
              case 'price_1NVfNRHKD0byXXClLn0jZo3k':
                subscriptionStatus = 'pro_day';
                break;
              case 'price_1NVfNlHKD0byXXClcCS7GGUy':
                subscriptionStatus = 'pro_week';
                break;
              default:
                subscriptionStatus = 'unsubscribed';
            }
            await User.findByIdAndUpdate(user._id, {
              oneTimePaymentPlan: subscriptionStatus,
            });
            console.log(`Payment succeeded for checkout session ID: ${session.id}`);
          } else {
            console.log("User not found with the given customer ID.");
          }
        }
        break;

      case "payment_intent.succeeded":
        const paymentIntent = event.data.object;
        const paymentUser = await User.findOne({ stripeCustomerId: paymentIntent.customer });
        if (paymentUser) {
          await User.findByIdAndUpdate(paymentUser._id, {
            subscriptionStatus: 'active',
          });
          console.log(`Payment Succeeded for payment intent ID: ${paymentIntent.id}`);
        } else {
          console.log("User not found with the given customer ID.");
        }
        break;

      case "payment_intent.created":
        console.log(`Payment intent created with ID: ${event.data.object.id}`);
        break;
      
      case "payment_intent.requires_action":
        console.log(`Payment requires action for payment intent ID: ${event.data.object.id}`);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Return a 200 status to acknowledge receipt of the event
    res.status(200).json({ received: true });
  };
}


module.exports = { handleStripeWebhook };