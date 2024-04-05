const StripeCheckout = require('~/models/StripeCheckout');
const User = require('~/models/User');
const Stripe = require('stripe');
const sendEmail = require('~/server/utils/sendEmail');
const emailTemplates = require('~/server/utils/emailTemplates');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

const stripeWebhookController = async (req, res) => {
  const requestType = req.body.type;

  try {
    if (requestType === 'checkout.session.completed') {
      const { customer, subscription, id } = req.body.data.object;
      const subscriptionDetail = await stripe.subscriptions.retrieve(subscription);

      const checkoutSession = await StripeCheckout.findById(id);

      const renewalDate = new Date(Number(subscriptionDetail.current_period_end) * 1000);

      if (checkoutSession) {
        const user = await User.findByIdAndUpdate(
          checkoutSession.user,
          {
            subscription: {
              active: true,
              customerId: customer,
              subscriptionId: subscriptionDetail.id,
              renewalDate,
              subType: checkoutSession.plan,
            },
          },
          { new: true },
        );

        await sendEmail(
          user.email,
          'Subscription successful!',
          {
            appName: process.env.APP_TITLE || 'ChatG App',
            name: user.name,
            year: new Date().getFullYear(),
          },
          'requestPasswordReset.handlebars',
          emailTemplates.subscribeEmail(user.name, new Date(renewalDate).toLocaleDateString()),
        );

        return res.json({ message: 'Subscription updated successfully', user });
      }

      return res.status(400).json({ message: 'Invalid checkout session' });
    }

    return res.status(400).json({ message: 'Invalid request type', requestType });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err });
  }
};

module.exports = stripeWebhookController;
