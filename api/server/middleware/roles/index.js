const { hasCapability, requireCapability } = require('./capabilities');
const checkAdmin = require('./admin');

module.exports = {
  checkAdmin,
  hasCapability,
  requireCapability,
};
