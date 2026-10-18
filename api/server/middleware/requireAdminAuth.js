const { createAdminScope } = require('@librechat/api');
const { findOrganization } = require('~/models');
const requireJwtAuth = require('./requireJwtAuth');

/**
 * Admin-panel routes: the signed-in user, then (organizations mode) the platform operator's
 * admin scope. Routers apply it before their capability checks.
 */
module.exports = [requireJwtAuth, createAdminScope({ findOrganization })];
