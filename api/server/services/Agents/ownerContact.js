const { logger } = require('@librechat/data-schemas');
const { attachAgentOwnerContacts } = require('@librechat/api');
const db = require('~/models');

const attachOwnerContacts = (agents) =>
  attachAgentOwnerContacts(agents, {
    getFirstOwnerIdsByResource: (resourceType, resourceIds) =>
      db.getFirstOwnerIdsByResource(resourceType, resourceIds),
    findUsers: (filter, select) => db.findUsers(filter, select),
    logger,
  });

module.exports = {
  attachOwnerContacts,
};
