const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { batchUploadCodeEnvFiles } = require('~/server/services/Files/Code/crud');
const { getSessionInfo, checkIfActive } = require('~/server/services/Files/Code/process');
const { enrichWithSkillConfigurable } = require('@librechat/api');
const db = require('~/models');

/**
 * Builds the `skillPrimedIdsByName` map passed through to
 * `enrichWithSkillConfigurable`. Centralized here so the four CJS call
 * sites (`initialize.js`, `responses.js` x2, `openai.js`) share one
 * source of truth — if `ResolvedManualSkill` ever renames `_id` or
 * gains new identifying fields, only this helper changes.
 *
 * Combines both manual (`$`-popover) primes AND always-apply primes so
 * `read_file` can:
 *  - Relax the `disable-model-invocation: true` gate for either source
 *    (the body is already in context; blocking its own files would be
 *    nonsensical).
 *  - Pin same-name collision lookups to the exact `_id` the resolver
 *    primed (otherwise a newer same-name duplicate could shadow the
 *    body/file pair within a single turn).
 *
 * On the rare overlap (a name appears in both arrays because upstream
 * dedup was skipped), manual wins — manual invocation is explicit user
 * intent and carries the authoritative `_id` for this turn.
 *
 * Returns `undefined` (not `{}`) when both arrays are empty, so the
 * downstream `enrichWithSkillConfigurable` cleanly omits the field from
 * `mergedConfigurable` rather than threading an empty object.
 *
 * @param {Array<{ name: string, _id: { toString(): string } }> | undefined} manualSkillPrimes
 * @param {Array<{ name: string, _id: { toString(): string } }> | undefined} alwaysApplySkillPrimes
 * @returns {Record<string, string> | undefined}
 */
function buildSkillPrimedIdsByName(manualSkillPrimes, alwaysApplySkillPrimes) {
  const manualCount = manualSkillPrimes?.length ?? 0;
  const alwaysApplyCount = alwaysApplySkillPrimes?.length ?? 0;
  if (manualCount === 0 && alwaysApplyCount === 0) {
    return undefined;
  }
  const out = {};
  /* Order matters on the edge case where the same name appears in both
     lists: always-apply goes in first, then manual overwrites — manual
     wins because it's explicit user intent for this turn. */
  if (alwaysApplyCount > 0) {
    for (const p of alwaysApplySkillPrimes) {
      out[p.name] = p._id.toString();
    }
  }
  if (manualCount > 0) {
    for (const p of manualSkillPrimes) {
      out[p.name] = p._id.toString();
    }
  }
  return out;
}

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

module.exports = {
  getSkillToolDeps,
  enrichWithSkillConfigurable,
  buildSkillPrimedIdsByName,
};
