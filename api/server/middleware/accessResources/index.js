const { canAccessResource } = require('./canAccessResource');
const { canAccessAgentResource } = require('./canAccessAgentResource');
const { canAccessAgentFromBody } = require('./canAccessAgentFromBody');
const { canAccessPromptResource } = require('./canAccessPromptResource');

module.exports = {
  canAccessResource,
  canAccessAgentResource,
  canAccessAgentFromBody,
  canAccessPromptResource,
};
