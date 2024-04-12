const mongoose = require('mongoose');
const preferenceSchema = require('./schema/preference');

module.exports = mongoose.model('Preference', preferenceSchema);
