// Customize
const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
const User = require('~/models/User');
const StripeCheckout = require('~/models/StripeCheckout');
const sendEmail = require('~/server/utils/sendEmail');
const { unSubscribeEmail } = require('~/server/utils/emailTemplates');

const subscribeInStripeController = async (req, res) => {
  const { callback, plan } = req.body;
  try {
    const stripeSession = await stripe.checkout.sessions.create({
      line_items: [
        {
          price:
            plan === 'MONTHLY'
              ? process.env.STRIPE_MONTHLY_PRICE_ID
              : process.env.STRIPE_YEARLY_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.DOMAIN_CLIENT}${callback}`,
      cancel_url: `${process.env.DOMAIN_CLIENT}${callback}`,
    });

    // Create new Stripe Checkout Session
    const newCheckoutSession = new StripeCheckout({
      _id: stripeSession.id,
      user: req.user._id,
      mode: stripeSession.mode,
      currency: stripeSession.currency,
      successUrl: stripeSession.success_url,
      cancelUrl: stripeSession.cancel_url,
      plan,
    });

    await newCheckoutSession.save();

    res.json({ session: stripeSession });
  } catch (err) {
    return res.status(500).json({ message: err });
  }
};

const topupStripeController = async (req, res) => {
  const { callback } = req.body;

  try {
    const stripeSession = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: process.env.STRIPE_TOPUP_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.DOMAIN_CLIENT}${callback}`,
      cancel_url: `${process.env.DOMAIN_CLIENT}${callback}`,
    });

    const newCheckoutSession = new StripeCheckout({
      _id: stripeSession.id,
      user: req.user._id,
      mode: stripeSession.mode,
      currency: stripeSession.currency,
      successUrl: stripeSession.success_url,
      cancelUrl: stripeSession.cancel_url,
      plan: 'TOPUP',
    });

    await newCheckoutSession.save();

    res.json({ session: stripeSession });
  } catch (err) {
    return res.status(500).json({ message: err });
  }
};

// const subscribeResultController = async (req, res) => {
//   const { success, refreshToken } = req.query;

//   const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
//   try {
//     if (success === 'false') {
//       return res.redirect(`${process.env.DOMAIN_CLIENT}${payload.callback}`);
//     }
//     res.redirect(`${process.env.DOMAIN_CLIENT}${payload.callback}?subscribe=topup-welcome`);
//   } catch (err) {
//     console.error(err);
//     res.redirect(`${process.env.DOMAIN_CLIENT}${payload.callback}?subscribe=topup-failed`);
//   }
// };

const unSubscribeInStripeController = async (req, res) => {
  const renewalDate = req.body.renewalDate;
  try {
    await stripe.subscriptions.update(req.user.subscription.subscriptionId, {
      cancel_at_period_end: true,
    });

    const user = await User.findByIdAndUpdate(req.user._id, { 'subscription.active': false });
    await sendEmail(
      user.email,
      'ChatG Premium Cancellation Confirmation',
      {
        appName: process.env.APP_TITLE || 'ChatG App',
        name: user.name,
        year: new Date().getFullYear(),
      },
      'requestPasswordReset.handlebars',
      unSubscribeEmail(user.name, renewalDate),
    );
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err });
  }
};

const reactiveSubscriptionInStripeController = async (req, res) => {
  try {
    await stripe.subscriptions.update(req.user.subscription.subscriptionId, {
      cancel_at_period_end: false,
    });
    const user = await User.findByIdAndUpdate(req.user._id, { 'subscription.active': true });

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err });
  }
};

module.exports = {
  subscribeInStripeController,
  unSubscribeInStripeController,
  reactiveSubscriptionInStripeController,
  topupStripeController,
};
