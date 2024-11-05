const mongoose = require('mongoose');
const subscriptionPlanSchema = require('./schema/subscriptionPlan');

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
