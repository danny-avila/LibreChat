const mongoose = require('mongoose');
const challengeSchema = require('~/models/schema/challengeSchema');

const Challenge = mongoose.model('Challenge', challengeSchema);

module.exports = Challenge;
