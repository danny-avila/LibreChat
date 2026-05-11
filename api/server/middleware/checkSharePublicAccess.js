const { createSharePolicyMiddleware } = require('@librechat/api');
const { getRoleByName } = require('~/models');
const { hasCapability } = require('~/server/middleware/roles/capabilities');

module.exports = createSharePolicyMiddleware({
  getRoleByName,
  hasCapability,
});
