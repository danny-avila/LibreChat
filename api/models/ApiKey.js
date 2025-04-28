const mongoose = require('mongoose');
const apiKeySchema = require('./schema/apiKey');

const ApiKey = mongoose.model('ApiKey', apiKeySchema);
module.exports = ApiKey;
