const {
  createPromptUseChecker,
  createAgentInstructionPromptResolver,
  createLangfusePromptProvider,
  resolveLangfusePromptDestinations,
} = require('@librechat/api');
const { ResourceType } = require('librechat-data-provider');
const { getEffectivePermissions } = require('~/server/services/PermissionService');
const db = require('~/models');

const langfuse = createLangfusePromptProvider({
  resolveDestinations: resolveLangfusePromptDestinations,
  fetch,
});

const instructionPromptResolver = createAgentInstructionPromptResolver({
  canUseLibreChatPrompts: createPromptUseChecker(db.getRoleByName),
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
