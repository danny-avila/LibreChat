const crypto = require('crypto');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { batchUploadCodeEnvFiles } = require('~/server/services/Files/Code/crud');
const {
  getSessionInfo,
  checkIfActive,
  readSandboxFile,
  writeSandboxFile,
} = require('~/server/services/Files/Code/process');
const {
  checkAccess,
  getStorageMetadata,
  resolveRequestTenantId,
  enrichWithSkillConfigurable,
} = require('@librechat/api');
const {
  Permissions,
  FileContext,
  ResourceType,
  PermissionBits,
  AccessRoleIds,
  PrincipalType,
  PermissionTypes,
} = require('librechat-data-provider');
const { checkPermission, grantPermission } = require('~/server/services/PermissionService');
const { getFileStrategy } = require('~/server/utils/getFileStrategy');
const db = require('~/models');

function resolveSkillStorage(req, { isImage = false } = {}) {
  const source = getFileStrategy(req.config, { context: FileContext.skill_file, isImage });
  const strategy = getStrategyFunctions(source);
  if (!strategy.saveBuffer) {
    throw new Error(`Storage backend "${source}" does not support file writes`);
  }
  return { saveBuffer: strategy.saveBuffer, source };
}

function basename(relativePath) {
  const slash = relativePath.lastIndexOf('/');
  return slash === -1 ? relativePath : relativePath.slice(slash + 1);
}

async function saveSkillFileContent({ req, skillId, relativePath, content, mimeType }) {
  const existingFile = await db.getSkillFileByPath(skillId, relativePath);
  const tenantId = resolveRequestTenantId(req);
  const fileId = crypto.randomUUID();
  const filename = basename(relativePath);
  const storageFileName = `${fileId}__${filename}`;
  const buffer = Buffer.from(content, 'utf8');
  const storage = resolveSkillStorage(req, { isImage: mimeType.startsWith('image/') });
  const filepath = await storage.saveBuffer({
    userId: req.user.id,
    buffer,
    fileName: storageFileName,
    basePath: 'uploads',
    tenantId,
  });
  const storageMetadata = getStorageMetadata({ filepath, source: storage.source });

  let result;
  try {
    result = await db.upsertSkillFile({
      skillId,
      relativePath,
      file_id: fileId,
      filename,
      filepath,
      ...storageMetadata,
      source: storage.source,
      mimeType,
      bytes: buffer.length,
      isExecutable: false,
      author: req.user._id ?? req.user.id,
      tenantId,
    });
  } catch (error) {
    const { deleteFile } = getStrategyFunctions(storage.source);
    if (deleteFile) {
      await deleteFile(req, { filepath, user: req.user.id, tenantId }).catch(() => undefined);
    }
    throw error;
  }

  if (existingFile && existingFile.filepath !== filepath) {
    const { deleteFile } = getStrategyFunctions(existingFile.source);
    if (deleteFile) {
      deleteFile(req, {
        filepath: existingFile.filepath,
        storageKey: existingFile.storageKey,
        storageRegion: existingFile.storageRegion,
        user: existingFile.author ?? req.user.id,
        tenantId: existingFile.tenantId ?? tenantId,
      }).catch(() => undefined);
    }
  }

  return { bytes: result.bytes, relativePath: result.relativePath };
}

function canCreateSkill({ req }) {
  return checkAccess({
    req,
    user: req.user,
    permissionType: PermissionTypes.SKILLS,
    permissions: [Permissions.USE, Permissions.CREATE],
    getRoleByName: db.getRoleByName,
  });
}

function canEditSkill({ req, skillId }) {
  return checkPermission({
    userId: req.user.id,
    role: req.user.role,
    resourceType: ResourceType.SKILL,
    resourceId: skillId,
    requiredPermission: PermissionBits.EDIT,
  });
}

function grantSkillOwner({ req, skillId }) {
  return grantPermission({
    principalType: PrincipalType.USER,
    principalId: req.user.id,
    resourceType: ResourceType.SKILL,
    resourceId: skillId,
    accessRoleId: AccessRoleIds.SKILL_OWNER,
    grantedBy: req.user.id,
  });
}

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
  createSkill: db.createSkill,
  updateSkill: db.updateSkill,
  deleteSkill: db.deleteSkill,
  canCreateSkill,
  canEditSkill,
  grantSkillOwner,
  saveSkillFileContent,
  listSkillFiles: db.listSkillFiles,
  getStrategyFunctions,
  batchUploadCodeEnvFiles,
  getSessionInfo,
  checkIfActive,
  updateSkillFileCodeEnvIds: db.updateSkillFileCodeEnvIds,
  getSkillFileByPath: db.getSkillFileByPath,
  updateSkillFileContent: db.updateSkillFileContent,
  /**
   * `read_file` falls back to a sandbox `cat` for `/mnt/data/...` paths
   * and for `{firstSegment}/...` paths whose first segment isn't a known
   * skill name. The handler routes through this when the agent has code
   * execution enabled; the codeapi base URL comes from
   * `LIBRECHAT_CODE_BASEURL` and the sandbox session id is forwarded by
   * the agents-side `ToolNode` via `tc.codeSessionContext`.
   */
  readSandboxFile,
  writeSandboxFile,
};

function getSkillToolDeps() {
  return skillToolDeps;
}

module.exports = {
  getSkillToolDeps,
  enrichWithSkillConfigurable,
  buildSkillPrimedIdsByName,
};
