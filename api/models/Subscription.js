const mongoose = require('mongoose');
const subscriptionSchema = require('./schema/subscription');

subscriptionSchema.statics.isSubscriptionActive = async function (userId) {
  const subscription = await this.findOne({ user: userId, status: 'active' }).lean();
  if (!subscription) {
    return false;
  }

  // Check if current date is before end date
  return subscription.endDate > new Date();
};

subscriptionSchema.statics.expireSubscriptions = async function () {
  const currentDate = new Date();
  await this.updateMany(
    { endDate: { $lt: currentDate }, status: 'active' },
    { status: 'expired' },
  );
};

module.exports = mongoose.model('Subscription', subscriptionSchema);
