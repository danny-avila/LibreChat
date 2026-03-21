/**
 * NOTE: hasCapability, requireCapability, hasConfigCapability, and
 * capabilityContextMiddleware are intentionally NOT re-exported here.
 *
 * capabilities.js depends on ~/models, and the middleware barrel
 * (middleware/index.js) is frequently required by modules that are
 * themselves loaded while the barrel is still initialising — creating
 * a circular-require that silently returns an empty exports object.
 *
 * Always import capability helpers directly:
 *   require('~/server/middleware/roles/capabilities')
 */
const checkAdmin = require('./admin');

module.exports = {
  checkAdmin,
};
