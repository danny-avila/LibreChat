const Balance = require('~/models/Balance');
const Subscription = require('~/models/Subscription');
const SubscriptionPlan = require('~/models/SubscriptionPlan');

async function balanceController(req, res) {
  try {
    // Retrieve user balance
    const { tokenCredits: balance = 0 } =
    (await Balance.findOne({ user: req.user.id }, 'tokenCredits').lean()) ?? 0;

    // Retrieve active subscription with plan details
    const activeSubscription = await Subscription.findOne({
      user: req.user.id,
      status: 'active',
      endDate: { $gte: new Date() },
    })
      .populate('subscriptionPlan', 'name description durationInDays tokenCredits features') // populate plan details
      .lean();

    const response = {
      balance: '' + balance,
      subscription: activeSubscription
        ? {
          planName: activeSubscription.subscriptionPlan.name,
          description: activeSubscription.subscriptionPlan.description,
          durationInDays: activeSubscription.subscriptionPlan.durationInDays,
          tokenCredits: activeSubscription.subscriptionPlan.tokenCredits,
          features: activeSubscription.subscriptionPlan.features,
          startDate: activeSubscription.startDate,
          endDate: activeSubscription.endDate,
        }
        : null,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching balance or subscription:', error);
    res.status(500).send('Error fetching balance or subscription');
  }
}

module.exports = balanceController;
