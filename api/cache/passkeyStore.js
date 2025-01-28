const { SessionChallengeStore } = require('passport-fido2-webauthn');

// Initialize SessionChallengeStore
const sessionChallengeStore = new SessionChallengeStore();

module.exports = sessionChallengeStore;
