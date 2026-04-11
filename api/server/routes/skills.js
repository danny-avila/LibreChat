const express = require('express');
const { createSkillsHandlers, generateCheckAccess } = require('@librechat/api');
const { isValidObjectIdString } = require('@librechat/data-schemas');
const { PermissionBits, PermissionTypes, Permissions } = require('librechat-data-provider');
const {
  createSkill,
  getSkillById,
  listSkillsByAccess,
  updateSkill,
  deleteSkill,
  listSkillFiles,
  deleteSkillFile,
  getRoleByName,
} = require('~/models');
const { requireJwtAuth, canAccessSkillResource } = require('~/server/middleware');
const {
  findAccessibleResources,
  findPubliclyAccessibleResources,
  grantPermission,
} = require('~/server/services/PermissionService');

const router = express.Router();

// Role-based capability gates. Mirrors prompts.js — the ACL middleware on each
// route handles per-resource permissions; these check that the caller's role
// is even allowed to use / create skills at all.
const checkSkillAccess = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE],
  getRoleByName,
});
const checkSkillCreate = generateCheckAccess({
  permissionType: PermissionTypes.SKILLS,
  permissions: [Permissions.USE, Permissions.CREATE],
  getRoleByName,
});

router.use(requireJwtAuth);
router.use(checkSkillAccess);

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
router.post('/', checkSkillCreate, handlers.create);

router.get(
  '/:id',
  canAccessSkillResource({ requiredPermission: PermissionBits.VIEW }),
  handlers.get,
);

router.patch(
  '/:id',
  checkSkillCreate,
  canAccessSkillResource({ requiredPermission: PermissionBits.EDIT }),
  handlers.patch,
);

router.delete(
  '/:id',
  checkSkillCreate,
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
