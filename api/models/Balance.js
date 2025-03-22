const mongoose = require('mongoose');
const { balanceSchema } = require('@librechat/data-schemas');

module.exports = mongoose.model('Balance', balanceSchema);
