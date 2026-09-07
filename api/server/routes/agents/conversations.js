const multer = require('multer');
const fs = require('fs');
const express = require('express');
const {
  createConversationDeletionService,
  createConversationImportHandler,
  createConversationManagementHandlers,
  generateCheckAccess,
  openCheckpointDeletion,
  deleteConvoSharedLinksWithCleanup,
  GenerationJobManager,
  isStopConfirmed,
  mapConversationManagementError,
  resolveImportMaxFileSize,
  restoreTenantContextFromReq,
  validateConversationUpdate,
} = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { PermissionTypes, Permissions } = require('librechat-data-provider');
const { checkBan, configMiddleware, createImportLimiters } = require('~/server/middleware');
const { createStorage, importFileFilter } = require('~/server/routes/files/multer');
const { importConversations } = require('~/server/utils/import');
const subagentThreadTaskStore = require('~/server/services/Endpoints/agents/subagentThreadStore');
const db = require('~/models');
const { preAuthTenantMiddleware, requireConversationManagementAuth } = require('./middleware');

const router = express.Router();
const { canRecoverAgentConversationDeletion, deleteConversations } =
  createConversationDeletionService({
    db,
    subagentThreadTaskStore,
    GenerationJobManager,
    openCheckpointDeletion,
    deleteConvoSharedLinksWithCleanup,
    isStopConfirmed,
    logger,
  });
const handlers = createConversationManagementHandlers({
  canRecoverAgentConversationDeletion,
  getConversationResourceDeletionState: db.getConversationResourceDeletionState,
  getConversationResource: db.getConversationResource,
  listConversationResources: db.listConversationResources,
  listConversationMessageResources: db.listConversationMessageResources,
  saveConvo: db.saveConvo,
  updateTagsForConversation: db.updateTagsForConversation,
  reconcileConversationTagCounts: db.reconcileConversationTagCounts,
  deleteConversations,
});
const importHandler = createConversationImportHandler({
  importConversations,
  cleanupUpload: fs.promises.unlink,
  getRoleByName: db.getRoleByName,
});
const checkBookmarkAccess = generateCheckAccess({
  permissionType: PermissionTypes.BOOKMARKS,
  permissions: [Permissions.USE],
  getRoleByName: db.getRoleByName,
});

const { importIpLimiter, importUserLimiter } = createImportLimiters();
const importUpload = multer({
  storage: createStorage({ uniqueTempPath: true }),
  fileFilter: importFileFilter,
  limits: { fileSize: resolveImportMaxFileSize() },
}).single('file');

function handleImportUpload(req, res, next) {
  importUpload(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      const mapped = mapConversationManagementError('invalid_request');
      return res.status(413).json(mapped.body);
    }
    if (error) {
      const mapped = mapConversationManagementError('invalid_request');
      return res.status(mapped.status).json(mapped.body);
    }
    return next();
  });
}

function checkTagAccess(req, res, next) {
  if (req.body?.tags === undefined) {
    return next();
  }
  return checkBookmarkAccess(req, res, next);
}

router.use(preAuthTenantMiddleware);
router.use(requireConversationManagementAuth);
router.use(checkBan);

router.get('/', handlers.list);
router.post(
  '/import',
  configMiddleware,
  importIpLimiter,
  importUserLimiter,
  handleImportUpload,
  restoreTenantContextFromReq,
  importHandler,
);
router.get('/:id/messages', handlers.messages);
router.get('/:id', handlers.get);
router.patch('/:id', configMiddleware, validateConversationUpdate, checkTagAccess, handlers.update);
router.delete('/:id', configMiddleware, handlers.remove);

router.use((_req, res) => {
  const mapped = mapConversationManagementError('not_found');
  return res.status(mapped.status).json(mapped.body);
});

module.exports = router;
