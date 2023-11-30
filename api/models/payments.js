// paymentModel.js
const mongoose = require('mongoose');
const paymentSchema = require('./schema/paymentSchema'); // Adjust the path as necessary

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;