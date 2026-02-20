const { hasCapability, requireCapability, hasConfigCapability } = require('./capabilities');
const checkAdmin = require('./admin');

module.exports = {
  checkAdmin,
  hasCapability,
  requireCapability,
  hasConfigCapability,
};
