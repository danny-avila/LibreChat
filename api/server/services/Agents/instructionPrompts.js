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

let canUseLibreChatPrompts;
const instructionPromptResolver = createAgentInstructionPromptResolver({
  canUseLibreChatPrompts: (context) => {
    if (canUseLibreChatPrompts == null) {
      canUseLibreChatPrompts = createPromptUseChecker(db.getRoleByName);
    }
    return canUseLibreChatPrompts(context);
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
