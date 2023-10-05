const mongoose = require('mongoose');
const keySchema = require('./schema/key');

module.exports = mongoose.model('Key', keySchema);
