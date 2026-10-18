const express = require('express');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { isOrganizationsEnabled } = require('@librechat/api');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireAdminAuth } = require('~/server/middleware');

const router = express.Router();

/**
 * Who is using the built-in admin panel. Answers 200 only for someone who can open it (in
 * organizations mode, the platform operator), so the app asks it before showing the panel.
 */
router.get(
  '/',
  requireAdminAuth,
  requireCapability(SystemCapabilities.ACCESS_ADMIN),
  (req, res) => {
    res.status(200).json({
      user: {
        id: req.user.id ?? req.user._id?.toString(),
        name: req.user.name,
        email: req.user.email,
      },
      organizations: isOrganizationsEnabled(),
    });
  },
);

module.exports = router;
