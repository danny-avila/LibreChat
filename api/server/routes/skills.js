const express = require('express');
const { createSkillsHandlers } = require('@librechat/api');
const { isValidObjectIdString } = require('@librechat/data-schemas');
const { PermissionBits } = require('librechat-data-provider');
const {
  createSkill,
  getSkillById,
  listSkillsByAccess,
  updateSkill,
  deleteSkill,
  listSkillFiles,
  deleteSkillFile,
} = require('~/models');
const { requireJwtAuth, canAccessSkillResource } = require('~/server/middleware');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
  grantPermission,
} = require('~/server/services/PermissionService');

const router = express.Router();

router.use(requireJwtAuth);

const handlers = createSkillsHandlers({
  createSkill,
  getSkillById,
  listSkillsByAccess,
  updateSkill,
  deleteSkill,
  listSkillFiles,
  deleteSkillFile,
  findAccessibleResources,
  findPubliclyAccessibleResources,
  grantPermission,
  isValidObjectIdString,
});

router.get('/', handlers.list);
router.post('/', handlers.create);

router.get(
  '/:id',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.get,
);

router.patch(
  '/:id',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.patch,
);

router.delete(
  '/:id',
  canAccessSkillResource({ requiredPermission: PermissionBits.DELETE }),
  handlers.delete,
);

router.get(
  '/:id/files',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.listFiles,
);

router.post(
  '/:id/files',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.uploadFileStub,
);

router.get(
  '/:id/files/:relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.downloadFileStub,
);

router.delete(
  '/:id/files/:relativePath',
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.deleteFile,
);

module.exports = router;
