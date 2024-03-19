const { customerHasFeature } = require('../utils/useStripeSubscription');
const findOrCreateCustomerId = require('../utils/findOrCreateCustomerId');

const requireSubscription = async (req, res, next) => {
  const customerId = await findOrCreateCustomerId({
    clerkUserId: req.auth.userId,
    clerkOrgId: req.auth.orgId,
  });
  const isSubscribed = await customerHasFeature({ customerId, feature: 'subscription' });
  if (isSubscribed) {
    next();
  } else {
    return res.status(400).send({ error: 'User have no subscribed.' });
  }
};

module.exports = requireSubscription;
