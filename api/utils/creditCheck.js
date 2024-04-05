const { User } = require('~/models');
const { isPremiumModel } = require('~/config/premiumModels');

const decreaseUnpremiumUserCredit = async (user, model) => {
  if (user.subscription.active && isPremiumModel(model)) {
    await User.findByIdAndUpdate(user.id, {
      $inc: { credits: -1 },
    });
  }
};

module.exports = {
  decreaseUnpremiumUserCredit,
};
