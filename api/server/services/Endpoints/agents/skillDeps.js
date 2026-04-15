const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { batchUploadCodeEnvFiles } = require('~/server/services/Files/Code/crud');
const { getSessionInfo, checkIfActive } = require('~/server/services/Files/Code/process');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
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
 * Augments a loadTools result with skill-specific configurable properties.
 * Loads the code API key and merges it with accessibleSkillIds and the request object.
 * @param {object} result - The result from loadToolsForExecution
 * @param {object} req - The Express request object
 * @param {Array} accessibleSkillIds - Pre-computed accessible skill IDs
 * @returns {Promise<object>} Augmented result with skill configurable
 */
async function enrichWithSkillConfigurable(result, req, accessibleSkillIds) {
  let codeApiKey;
  try {
    const authValues = await loadAuthValues({
      userId: req.user.id,
      authFields: ['LIBRECHAT_CODE_API_KEY'],
    });
    codeApiKey = authValues.LIBRECHAT_CODE_API_KEY;
  } catch {
    // Code API key not configured
  }
  return {
    ...result,
    configurable: {
      ...result.configurable,
      req,
      codeApiKey,
      accessibleSkillIds,
    },
  };
}

module.exports = { getSkillToolDeps, enrichWithSkillConfigurable };
