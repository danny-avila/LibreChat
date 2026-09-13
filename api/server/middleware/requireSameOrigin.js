const { createSameOriginGuard } = require('@librechat/api');

module.exports = createSameOriginGuard({
  trustedOrigins: [process.env.DOMAIN_CLIENT, process.env.DOMAIN_SERVER],
});
