const { createRegistrationInviteCheck } = require('@librechat/api');
const { invites } = require('~/server/services/Organizations');

module.exports = createRegistrationInviteCheck({ invites });
