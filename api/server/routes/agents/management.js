const express = require('express');
const crypto = require('crypto');
const fs = require('fs').promises;
const {
  EModelEndpoint,
  getEndpointFileConfig,
  mergeFileConfig,
  resolveEndpointType,
} = require('librechat-data-provider');
const { logger } = require('@librechat/data-schemas');
const {
  createAgentManagementCreateHandler,
  createAgentManagementDeleteHandler,
  createAgentManagementFileHandlers,
  createAgentManagementUploadResponse,
  createAgentManagementReadHandlers,
  createAgentManagementUpdateHandler,
  ioredisClient,
  mapAgentManagementError,
  restoreTenantContextFromReq,
} = require('@librechat/api');
const { checkBan, configMiddleware, createFileLimiters } = require('~/server/middleware');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { checkPermission, findAccessibleResources } = require('~/server/services/PermissionService');
const { createMulterInstance } = require('~/server/routes/files/multer');
const { handleFileUpload } = require('~/server/routes/files/files');
const { getEndpointsConfig } = require('~/server/services/Config');
const v1 = require('~/server/controllers/agents/v1');
const db = require('~/models');
const { requireAgentManagementAuth } = require('./middleware');

const AGENT_UPLOAD_LOCK_TTL_MS = 10 * 60 * 1000;
const AGENT_UPLOAD_LOCK_WAIT_MS = 2 * 60 * 1000;
const AGENT_UPLOAD_LOCK_RENEW_MS = Math.floor(AGENT_UPLOAD_LOCK_TTL_MS / 3);
const releaseUploadLockScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const renewUploadLockScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

const withAgentUploadLock = async (key, task) => {
  if (!ioredisClient) {
    return await task();
  }
  const lockKey = `agent-management:file-upload:${key}`;
  const token = crypto.randomUUID();
  const deadline = Date.now() + AGENT_UPLOAD_LOCK_WAIT_MS;
  while ((await ioredisClient.set(lockKey, token, 'PX', AGENT_UPLOAD_LOCK_TTL_MS, 'NX')) !== 'OK') {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for Agent file upload lock');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  let stopped = false;
  let renewalTimer;
  const renewLease = async () => {
    try {
      const renewed = await ioredisClient.eval(
        renewUploadLockScript,
        1,
        lockKey,
        token,
        AGENT_UPLOAD_LOCK_TTL_MS,
      );
      if (renewed !== 1) {
        logger.warn('[AgentManagement] Lost Agent file upload lock before processing completed');
      }
    } catch (error) {
      logger.warn('[AgentManagement] Failed to renew Agent file upload lock', error);
    } finally {
      if (!stopped) {
        renewalTimer = setTimeout(renewLease, AGENT_UPLOAD_LOCK_RENEW_MS);
        renewalTimer.unref?.();
      }
    }
  };
  renewalTimer = setTimeout(renewLease, AGENT_UPLOAD_LOCK_RENEW_MS);
  renewalTimer.unref?.();
  try {
    return await task();
  } finally {
    stopped = true;
    clearTimeout(renewalTimer);
    try {
      await ioredisClient.eval(releaseUploadLockScript, 1, lockKey, token);
    } catch (error) {
      logger.warn('[AgentManagement] Failed to release Agent file upload lock', error);
    }
  }
};

const router = express.Router();
const readHandlers = createAgentManagementReadHandlers({
  getRoleByName: db.getRoleByName,
  getAgentWithVersionCount: db.getAgentWithVersionCount,
  getAgentManagementListByAccess: db.getAgentManagementListByAccess,
  findAccessibleResources,
  checkPermission,
  hasCapability,
});
const createHandler = createAgentManagementCreateHandler({
  getRoleByName: db.getRoleByName,
  createAgent: v1.createAgent,
});
const updateHandler = createAgentManagementUpdateHandler({
  getRoleByName: db.getRoleByName,
  getAgentWithVersionCount: db.getAgentWithVersionCount,
  checkPermission,
  hasCapability,
  updateAgent: v1.updateAgent,
});
const deleteHandler = createAgentManagementDeleteHandler({
  getRoleByName: db.getRoleByName,
  getAgentWithVersionCount: db.getAgentWithVersionCount,
  checkPermission,
  hasCapability,
  deleteAgent: db.deleteAgent,
});
const fileHandlers = createAgentManagementFileHandlers({
  getRoleByName: db.getRoleByName,
  getAgentWithVersionCount: db.getAgentWithVersionCount,
  getFiles: db.getFiles,
  checkPermission,
  hasCapability,
  removeAgentResourceFiles: db.removeAgentResourceFiles,
  processUpload: (req, res) =>
    handleFileUpload(
      req,
      createAgentManagementUploadResponse(res, req.file, req.body.tool_resource),
    ),
  deleteTempFile: fs.unlink,
  getUploadConfig: async (req, agent) => {
    const endpoint = agent.provider || EModelEndpoint.agents;
    const endpointType = resolveEndpointType(
      await getEndpointsConfig(req),
      EModelEndpoint.agents,
      endpoint,
    );
    const endpointConfig = getEndpointFileConfig({
      fileConfig: mergeFileConfig(req.config?.fileConfig),
      endpoint,
      endpointType,
    });
    return {
      endpoint,
      endpointType,
      disabled: endpointConfig.disabled,
      fileLimit: endpointConfig.fileLimit,
      totalSizeLimit: endpointConfig.totalSizeLimit,
    };
  },
  runUploadExclusive: withAgentUploadLock,
});
const sendUploadRateLimit = (_req, res) =>
  res.status(429).json({
    error: {
      code: 'invalid_request',
      message: 'Too many file upload requests. Try again later',
    },
  });
const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters({
  onLimit: sendUploadRateLimit,
});
const uploadSingleFile = async (req, res, next) => {
  try {
    const upload = await createMulterInstance({
      fileConfig: req.config?.fileConfig ?? null,
      resolveEndpoint: fileHandlers.getUploadConfig,
      uniqueTempPath: true,
    });
    return upload.single('file')(req, res, next);
  } catch (error) {
    return next(error);
  }
};
const handleUploadError = (error, _req, res, _next) => {
  const status = Number(error?.statusCode);
  const isMultipartRequestError =
    error?.name === 'MulterError' ||
    error?.code?.startsWith?.('LIMIT_') ||
    (Number.isInteger(status) && status >= 400 && status < 500);
  const code = isMultipartRequestError ? 'invalid_request' : 'internal_error';
  const mapped = mapAgentManagementError(code);
  return res.status(mapped.status).json(mapped.body);
};

router.use(requireAgentManagementAuth);
router.use(checkBan);

router.post('/', configMiddleware, createHandler);
router.get('/', readHandlers.list);
router.post(
  '/:id/files',
  configMiddleware,
  fileUploadIpLimiter,
  fileUploadUserLimiter,
  fileHandlers.authorizeUpload,
  uploadSingleFile,
  restoreTenantContextFromReq,
  fileHandlers.upload,
  handleUploadError,
);
router.get('/:id/files', fileHandlers.list);
router.delete('/:id/files/:fileId', fileHandlers.remove);
router.get('/:id', readHandlers.get);
router.patch('/:id', configMiddleware, updateHandler);
router.delete('/:id', deleteHandler);

router.use((_req, res) => {
  const { status, body } = mapAgentManagementError('not_found');
  return res.status(status).json(body);
});

module.exports = router;
