const {
  createAgentInstructionPromptResolver,
  createLangfusePromptProvider,
  resolveLangfusePromptDestinations,
} = require('@librechat/api');
const {
  Permissions,
  PermissionTypes,
  ResourceType,
  SystemRoles,
} = require('librechat-data-provider');
const { getEffectivePermissions } = require('~/server/services/PermissionService');
const db = require('~/models');

const langfuse = createLangfusePromptProvider({
  resolveDestinations: resolveLangfusePromptDestinations,
  fetch,
});

const instructionPromptResolver = createAgentInstructionPromptResolver({
  canUseLibreChatPrompts: async ({ role }) => {
    if (role === SystemRoles.ADMIN) {
      return true;
    }
    if (!role) {
      return false;
    }
    const roleRecord = await db.getRoleByName(role);
    return roleRecord?.permissions?.[PermissionTypes.PROMPTS]?.[Permissions.USE] === true;
  },
  getLibreChatPromptPermissions: ({ userId, role, promptId }) =>
    getEffectivePermissions({
      userId,
      role,
      resourceType: ResourceType.PROMPTGROUP,
      resourceId: promptId,
    }),
  getLibreChatPromptGroup: (promptId) => db.getPromptGroup({ _id: promptId }),
  getLibreChatPrompts: (promptId) => db.getPrompts({ groupId: promptId }),
  langfuse,
});

module.exports = instructionPromptResolver;
