const mongoose = require('mongoose');
const balanceSchema = require('./schema/balance');

module.exports = mongoose.model('Balance', balanceSchema);
