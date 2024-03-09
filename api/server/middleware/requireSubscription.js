const { customerHasFeature } = require('../utils/useStripeSubscription');
const findOrCreateCustomerId = require('../utils/findOrCreateCustomerId');

const requireSubscription = async (req, res, next) => {
  const customerId = await findOrCreateCustomerId(req.auth.userId);
  const isSubscribed = await customerHasFeature({ customerId, feature: 'subscription' });
  if (isSubscribed) {
    next();
  } else {
    return res.status(422).send({ error: 'User have no subscribed.' });
  }
};

module.exports = requireSubscription;
