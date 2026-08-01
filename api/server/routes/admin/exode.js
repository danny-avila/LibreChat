const express = require('express');
const { createExodeProvisionUserController } = require('@librechat/api');
const { SystemCapabilities, getTenantId } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const { findUser, createUser, updateUser } = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);

const provisionUser = createExodeProvisionUserController({
  findUser,
  createUser,
  updateUser,
  getTenantId,
});

/**
 * Server-to-server provisioning of exode principals.
 *
 * Admin-gated rather than secret-gated: the caller (the AI service) already signs in with an
 * admin service account to drive the agent APIs, so this reuses that session instead of
 * introducing another shared secret to distribute and rotate.
 */
router.use(requireJwtAuth, requireAdminAccess);

router.post('/users', provisionUser);

module.exports = router;
