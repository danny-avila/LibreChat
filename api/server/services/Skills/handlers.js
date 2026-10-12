const { createSkillsHandlers } = require('@librechat/api');
const {
  isValidObjectIdString,
  createSkillDeletionPersistenceAdapter,
} = require('@librechat/data-schemas');
const { PermissionBits } = require('librechat-data-provider');
const {
  createSkill,
  updateSkill,
  deleteSkillFile,
  beginSkillDeletion,
  getSkillDeletion,
  listSkillUploadIntents,
  listSkillDeletionTombstones,
  listAbandonedSkillUploadIntents,
  deleteSkillFileAfterBlob,
  finalizeSkillDeletion,
  completeSkillDeletion,
  reopenSkillDeletion,
  markSkillUploadIntentCleaned,
} = require('~/models');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
  hasPublicPermission,
  grantPermission,
} = require('~/server/services/PermissionService');
const {
  getSkillDbMethods,
  withDeploymentSkillIds,
  getSkillStrategyFunctions,
} = require('~/server/services/Endpoints/agents/skillDeps');
const { deleteSkillForLegacy } = require('./deletion');

function getSkillsHandlers() {
  const skillDbMethods = getSkillDbMethods();
  const deletionDb = createSkillDeletionPersistenceAdapter({
    beginSkillDeletion,
    getSkillDeletion,
    listSkillUploadIntents,
    listSkillDeletionTombstones,
    listAbandonedSkillUploadIntents,
    listSkillFiles: skillDbMethods.listSkillFiles,
  });
  return createSkillsHandlers({
    createSkill,
    getSkillById: skillDbMethods.getSkillById,
    listSkillsByAccess: skillDbMethods.listSkillsByAccess,
    updateSkill,
    deleteSkill: deleteSkillForLegacy,
    beginSkillDeletion: deletionDb.beginSkillDeletion,
    getSkillDeletion: deletionDb.getSkillDeletion,
    listSkillUploadIntents: deletionDb.listSkillUploadIntents,
    listSkillDeletionFiles: deletionDb.listSkillFiles,
    deleteSkillFileAfterBlob,
    finalizeSkillDeletion,
    completeSkillDeletion,
    reopenSkillDeletion,
    markSkillUploadIntentCleaned,
    listSkillFiles: skillDbMethods.listSkillFiles,
    deleteSkillFile,
    getSkillFileByPath: skillDbMethods.getSkillFileByPath,
    updateSkillFileContent: skillDbMethods.updateSkillFileContent,
    getStrategyFunctions: getSkillStrategyFunctions,
    findAccessibleResources: async (params) =>
      params.resourceType === 'skill' && params.requiredPermissions === PermissionBits.VIEW
        ? withDeploymentSkillIds(await findAccessibleResources(params))
        : findAccessibleResources(params),
    findPubliclyAccessibleResources: async (params) =>
      params.resourceType === 'skill' && params.requiredPermissions === PermissionBits.VIEW
        ? withDeploymentSkillIds(await findPubliclyAccessibleResources(params))
        : findPubliclyAccessibleResources(params),
    hasPublicPermission: async (params) =>
      params.resourceType === 'skill' && params.requiredPermissions === PermissionBits.VIEW
        ? withDeploymentSkillIds([]).some((id) => id.toString() === params.resourceId.toString()) ||
          hasPublicPermission(params)
        : hasPublicPermission(params),
    grantPermission,
    isValidObjectIdString,
  });
}
module.exports = { getSkillsHandlers };
