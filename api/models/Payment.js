const mongoose = require('mongoose');
const paymentSchema = require('./schema/paymentSchema');

const Payment = mongoose.model('Payment', paymentSchema);