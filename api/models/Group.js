const mongoose = require('mongoose');
const { groupSchema } = require('@librechat/data-schemas');

module.exports = mongoose.model('Group', groupSchema);
