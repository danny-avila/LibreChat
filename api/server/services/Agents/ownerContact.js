const { logger } = require('@librechat/data-schemas');
const { ResourceType, PrincipalType, PermissionBits } = require('librechat-data-provider');
const { hasSupportContact, resolveAgentOwnerContact } = require('@librechat/api');
const db = require('~/models');

const OWNER_PERMISSION_BITS =
  PermissionBits.VIEW | PermissionBits.EDIT | PermissionBits.DELETE | PermissionBits.SHARE;

const getFirstOwnerIdsByResource = async (agents) => {
  const resourceIds = agents
    .filter((agent) => !hasSupportContact(agent))
    .map((agent) => agent?._id)
    .filter(Boolean);

  if (resourceIds.length === 0) {
    return new Map();
  }

  try {
    const entries = await db.aggregateAclEntries([
      {
        $match: {
          resourceType: ResourceType.AGENT,
          resourceId: { $in: resourceIds },
          principalType: PrincipalType.USER,
          permBits: OWNER_PERMISSION_BITS,
        },
      },
      { $sort: { grantedAt: 1, createdAt: 1, _id: 1 } },
      { $group: { _id: '$resourceId', principalId: { $first: '$principalId' } } },
    ]);

    return new Map(
      entries
        .map((entry) => [entry?._id?.toString(), entry?.principalId?.toString()])
        .filter(([resourceId, ownerId]) => resourceId && ownerId),
    );
  } catch (error) {
    logger.warn('[/Agents] Failed to resolve agent owner ACL entries', error);
    return new Map();
  }
};

const attachOwnerContacts = async (agents) => {
  if (!Array.isArray(agents) || agents.length === 0) {
    return agents;
  }

  const ownerIdsByResource = await getFirstOwnerIdsByResource(agents);
  const ownerIds = [
    ...new Set(
      agents
        .filter((agent) => !hasSupportContact(agent))
        .map((agent) => ownerIdsByResource.get(agent?._id?.toString()) ?? agent?.author?.toString())
        .filter(Boolean),
    ),
  ];

  let ownersById = new Map();
  if (ownerIds.length > 0) {
    try {
      const users = await db.findUsers({ _id: { $in: ownerIds } }, 'name username email');
      ownersById = new Map(users.map((user) => [user?._id?.toString(), user]));
    } catch (error) {
      logger.warn('[/Agents] Failed to resolve agent owner users', error);
    }
  }

  return agents.map((agent) => {
    if (hasSupportContact(agent)) {
      delete agent.owner_contact;
      return agent;
    }
    const ownerId = ownerIdsByResource.get(agent?._id?.toString()) ?? agent?.author?.toString();
    const ownerContact = resolveAgentOwnerContact(agent, ownersById.get(ownerId) ?? null);
    if (ownerContact) {
      agent.owner_contact = ownerContact;
    } else {
      delete agent.owner_contact;
    }
    return agent;
  });
};

module.exports = {
  attachOwnerContacts,
};
