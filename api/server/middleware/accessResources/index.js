const { canAccessResource } = require('./canAccessResource');
const { canAccessAgentResource } = require('./canAccessAgentResource');
const { canAccessAgentFromBody } = require('./canAccessAgentFromBody');

module.exports = {
  canAccessResource,
  canAccessAgentResource,
  canAccessAgentFromBody,
};
