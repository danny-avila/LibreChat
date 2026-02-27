const {
  hasCapability,
  requireCapability,
  hasConfigCapability,
  capabilityContextMiddleware,
} = require('./capabilities');
const checkAdmin = require('./admin');

module.exports = {
  checkAdmin,
  hasCapability,
  requireCapability,
  hasConfigCapability,
  capabilityContextMiddleware,
};
