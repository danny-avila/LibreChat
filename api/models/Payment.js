const mongoose = require('mongoose');
const paymentSchema = require('./schema/payment');

module.exports = mongoose.model('Payment', paymentSchema);
