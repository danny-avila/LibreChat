const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { batchUploadCodeEnvFiles } = require('~/server/services/Files/Code/crud');
const { getSessionInfo, checkIfActive } = require('~/server/services/Files/Code/process');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { enrichWithSkillConfigurable } = require('@librechat/api');
const db = require('~/models');

/**
 * Returns the skill-related properties for ToolExecuteOptions.
 * Shared across all three controller entry points (initialize.js, openai.js, responses.js).
 * @returns {{ getSkillByName: Function, listSkillFiles: Function, getStrategyFunctions: Function, batchUploadCodeEnvFiles: Function, getSessionInfo: Function, checkIfActive: Function, updateSkillFileCodeEnvIds: Function, getSkillFileByPath: Function, updateSkillFileContent: Function }}
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

/**
 * Wraps the TS enrichWithSkillConfigurable with the CJS loadAuthValues dependency.
 * @param {object} result - The result from loadToolsForExecution
 * @param {object} req - The Express request object
 * @param {Array} accessibleSkillIds - Pre-computed accessible skill IDs
 * @returns {Promise<object>} Augmented result with skill configurable
 */
function enrichConfigurable(result, req, accessibleSkillIds) {
  return enrichWithSkillConfigurable(result, req, accessibleSkillIds, loadAuthValues);
}

module.exports = { getSkillToolDeps, enrichWithSkillConfigurable: enrichConfigurable };
