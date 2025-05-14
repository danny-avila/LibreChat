const mongoose = require('mongoose');
const { keySchema } = require('@librechat/data-schemas');

module.exports = mongoose.model('Key', keySchema);
