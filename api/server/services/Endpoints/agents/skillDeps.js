const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { batchUploadCodeEnvFiles } = require('~/server/services/Files/Code/crud');
const { getSessionInfo, checkIfActive } = require('~/server/services/Files/Code/process');
const db = require('~/models');

/**
 * Returns the skill-related properties for ToolExecuteOptions.
 * Shared across all three controller entry points (initialize.js, openai.js, responses.js).
 */
function getSkillToolDeps() {
  return {
    getSkillByName: db.getSkillByName,
    listSkillFiles: db.listSkillFiles,
    getStrategyFunctions,
    batchUploadCodeEnvFiles,
    getSessionInfo,
    checkIfActive,
    updateSkillFileCodeEnvIds: db.updateSkillFileCodeEnvIds,
    getSkillFileByPath: db.getSkillFileByPath,
    updateSkillFileContent: db.updateSkillFileContent,
  };
}

module.exports = { getSkillToolDeps };
