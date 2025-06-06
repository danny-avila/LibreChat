const checkAdmin = require('./admin');
const { checkAccess, generateCheckAccess } = require('./access');

module.exports = {
  checkAdmin,
  checkAccess,
  generateCheckAccess,
};
