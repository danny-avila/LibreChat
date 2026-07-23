const express = require('express');
const { createArtifactAppHandlers } = require('@librechat/api');
const { PermissionBits } = require('librechat-data-provider');
const {
  createArtifactAppWithVersion,
  getArtifactAppByAppId,
  resolveArtifactAppId,
  listArtifactApps,
  updateArtifactApp,
  deleteArtifactApp,
  getArtifactVersion,
  listArtifactVersions,
  createArtifactVersion,
  releaseArtifactVersion,
  activateArtifactVersion,
  withdrawArtifactVersion,
  recordAuditEntry,
} = require('~/models');
const { requireJwtAuth, canAccessArtifactAppResource } = require('~/server/middleware');
const {
  findAccessibleResources,
  grantPermission,
} = require('~/server/services/PermissionService');
const configMiddleware = require('~/server/middleware/config/app');

const router = express.Router();

router.use(requireJwtAuth);
router.use(configMiddleware);

const handlers = createArtifactAppHandlers({
  createArtifactAppWithVersion,
  getArtifactAppByAppId,
  resolveArtifactAppId,
  listArtifactApps,
  updateArtifactApp,
  deleteArtifactApp,
  getArtifactVersion,
  listArtifactVersions,
  createArtifactVersion,
  releaseArtifactVersion,
  activateArtifactVersion,
  withdrawArtifactVersion,
  findAccessibleResources,
  grantPermission,
  recordAuditEntry,
});

// Collection
router.get('/', handlers.list);
router.post('/', handlers.publish);

// Single app
router.get(
  '/:id',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.get,
);
router.patch(
  '/:id',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.update,
);
router.delete(
  '/:id',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.DELETE }),
  handlers.remove,
);

// Versions
router.get(
  '/:id/versions',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.listVersions,
);
router.post(
  '/:id/versions',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.createVersion,
);
router.get(
  '/:id/versions/:versionId',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.getVersion,
);
router.post(
  '/:id/versions/:versionId/release',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.releaseVersion,
);
router.post(
  '/:id/versions/:versionId/activate',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.activateVersion,
);
router.post(
  '/:id/versions/:versionId/withdraw',
  canAccessArtifactAppResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.withdrawVersion,
);

module.exports = router;
