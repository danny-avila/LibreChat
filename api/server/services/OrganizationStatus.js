const { createOrganizationStatusCache } = require('@librechat/api');
const { findOrganization } = require('~/models');

/**
 * The one organization status cache for this process: request auth, the issuer and invites read
 * it, and the operator's suspend, reactivate and delete actions evict from it.
 */
module.exports = createOrganizationStatusCache({ findOrganization });
