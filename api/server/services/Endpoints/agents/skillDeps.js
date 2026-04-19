const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { batchUploadCodeEnvFiles } = require('~/server/services/Files/Code/crud');
const { getSessionInfo, checkIfActive } = require('~/server/services/Files/Code/process');
const { loadAuthValues } = require('~/server/services/Tools/credentials');
const { enrichWithSkillConfigurable } = require('@librechat/api');
const db = require('~/models');

/** Skill-related properties for ToolExecuteOptions (stable references, allocated once). */
const skillToolDeps = {
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

function getSkillToolDeps() {
  return skillToolDeps;
}

/**
 * Wraps the TS enrichWithSkillConfigurable with the CJS loadAuthValues dependency.
 * @param {object} result - The result from loadToolsForExecution
 * @param {object} req - The Express request object
 * @param {Array} accessibleSkillIds - Pre-computed accessible skill IDs
 * @param {string} [preResolvedCodeApiKey] - Pre-resolved code API key (skips redundant lookup)
 * @param {Record<string, string>} [manualSkillPrimedIdsByName] - Map of name → skill id for skills manually invoked this turn via the `$` popover. Pins same-name collision lookups in `read_file`.
 * @returns {Promise<object>} Augmented result with skill configurable
 */
function enrichConfigurable(
  result,
  req,
  accessibleSkillIds,
  preResolvedCodeApiKey,
  manualSkillPrimedIdsByName,
) {
  return enrichWithSkillConfigurable(
    result,
    req,
    accessibleSkillIds,
    loadAuthValues,
    preResolvedCodeApiKey,
    manualSkillPrimedIdsByName,
  );
}

module.exports = { getSkillToolDeps, enrichWithSkillConfigurable: enrichConfigurable };
