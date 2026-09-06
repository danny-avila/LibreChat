const express = require('express');
const fs = require('fs').promises;
const {
  createAgentManagementCreateHandler,
  createAgentManagementDeleteHandler,
  createAgentManagementFileHandlers,
  createAgentManagementUploadResponse,
  createAgentManagementReadHandlers,
  createAgentManagementUpdateHandler,
  mapAgentManagementError,
  restoreTenantContextFromReq,
} = require('@librechat/api');
const { checkBan, configMiddleware, createFileLimiters } = require('~/server/middleware');
const { hasCapability } = require('~/server/middleware/roles/capabilities');
const { checkPermission, findAccessibleResources } = require('~/server/services/PermissionService');
const { createMulterInstance } = require('~/server/routes/files/multer');
const { handleFileUpload } = require('~/server/routes/files/files');
const v1 = require('~/server/controllers/agents/v1');
const db = require('~/models');
const { requireAgentManagementAuth } = require('./middleware');

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
});
const { fileUploadIpLimiter, fileUploadUserLimiter } = createFileLimiters();
let uploadPromise;
const uploadSingleFile = (req, res, next) => {
  uploadPromise ??= createMulterInstance({ endpoint: 'agents' });
  uploadPromise.then((upload) => upload.single('file')(req, res, next)).catch(next);
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
  uploadSingleFile,
  restoreTenantContextFromReq,
  fileHandlers.upload,
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
