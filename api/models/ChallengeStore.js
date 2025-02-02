const mongoose = require('mongoose');
const challengeSchema = require('~/models/schema/challengeSchema');

const ChallengeStore = mongoose.model('Challenge', challengeSchema);

module.exports = ChallengeStore;