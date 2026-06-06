const express = require('express');
const { skillSyncConfigSchema } = require('librechat-data-provider');
const { createAdminSkillsSyncHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { hasCapability, requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { upsertSkillSyncCredential, deleteSkillSyncCredential } = require('~/models');
const { getGitHubSkillSyncRunnerForRequest } = require('~/server/services/Skills/sync');
const { getAppConfig } = require('~/server/services/Config');
const configMiddleware = require('~/server/middleware/config/app');

const router = express.Router();
const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

function getCapabilityUser(req, { platformOnly = false } = {}) {
  const id = req.user?.id ?? req.user?._id?.toString?.();
  if (!id) {
    return null;
  }
  return {
    id,
    role: req.user?.role ?? '',
    ...(platformOnly ? {} : { tenantId: req.user?.tenantId }),
  };
}

function parseSkillSyncConfig(raw) {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const parsed = skillSyncConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function isSameSkillSyncConfig(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function hasResolvedSkillSyncOverride(req) {
  const resolved = parseSkillSyncConfig(req.config?.skillSync);
  const base = parseSkillSyncConfig(req.config?.config?.skillSync);
  return Boolean(resolved?.github && !isSameSkillSyncConfig(resolved, base));
}

function hasServerCredentialReference(config) {
  return Boolean(config?.github?.sources?.some((source) => source.credentialKey || source.token));
}

async function attachBaseSkillSyncConfig(req, res, next) {
  try {
    const baseConfig = await getAppConfig({ baseOnly: true });
    req.config = {
      ...(req.config ?? {}),
      config: {
        ...(req.config?.config ?? {}),
        skillSync: baseConfig?.skillSync,
      },
    };
    return next();
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

async function hasSkillCapability(req, capability, { platformOnly = false } = {}) {
  const user = getCapabilityUser(req, { platformOnly });
  if (!user) {
    return false;
  }
  return hasCapability(user, capability);
}

function requireSkillCapability(capability, { platformOnly = false } = {}) {
  return async (req, res, next) => {
    try {
      const user = getCapabilityUser(req, { platformOnly });
      if (!user) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      if (await hasCapability(user, capability)) {
        return next();
      }
      return res.status(403).json({ message: 'Forbidden' });
    } catch {
      return res.status(500).json({ message: 'Internal Server Error' });
    }
  };
}

async function attachCredentialReadAccess(req, res, next) {
  try {
    const canReadCredentials = await hasSkillCapability(req, SystemCapabilities.READ_SKILLS, {
      platformOnly: true,
    });
    req.skillSyncCanReadCredentials = canReadCredentials;
    req.skillSyncAllowServerCredentials = canReadCredentials;
    return next();
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

async function requireSyncRunCapability(req, res, next) {
  try {
    const canManagePlatform = await hasSkillCapability(req, SystemCapabilities.MANAGE_SKILLS, {
      platformOnly: true,
    });
    if (canManagePlatform) {
      req.skillSyncAllowServerCredentials = true;
      return next();
    }
    const resolved = parseSkillSyncConfig(req.config?.skillSync);
    if (
      hasResolvedSkillSyncOverride(req) &&
      (await hasSkillCapability(req, SystemCapabilities.MANAGE_SKILLS))
    ) {
      if (hasServerCredentialReference(resolved)) {
        return res.status(403).json({
          message: 'Tenant-scoped skill sync runs cannot use server credentials',
        });
      }
      req.skillSyncAllowServerCredentials = false;
      return next();
    }
    return res.status(403).json({ message: 'Forbidden' });
  } catch {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

const requireReadSkills = requireSkillCapability(SystemCapabilities.READ_SKILLS);
const requirePlatformManageSkills = requireSkillCapability(SystemCapabilities.MANAGE_SKILLS, {
  platformOnly: true,
});

const handlers = createAdminSkillsSyncHandlers({
  getRunner: getGitHubSkillSyncRunnerForRequest,
  upsertCredential: upsertSkillSyncCredential,
  deleteCredential: deleteSkillSyncCredential,
});

router.use(requireJwtAuth, requireAdminAccess, configMiddleware, attachBaseSkillSyncConfig);

router.get('/sync/status', requireReadSkills, attachCredentialReadAccess, handlers.getSyncStatus);
router.post('/sync/run', requireSyncRunCapability, handlers.runSync);
router.put('/sync/credentials/:credentialKey', requirePlatformManageSkills, handlers.setCredential);
router.delete(
  '/sync/credentials/:credentialKey',
  requirePlatformManageSkills,
  handlers.deleteCredential,
);

module.exports = router;
