const express = require('express');
const { createAdminBannersHandlers } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const db = require('~/models');

const router = express.Router();

const requireAdminAccess = requireCapability(SystemCapabilities.ACCESS_ADMIN);
const requireReadBanners = requireCapability(SystemCapabilities.READ_BANNERS);
const requireManageBanners = requireCapability(SystemCapabilities.MANAGE_BANNERS);

const handlers = createAdminBannersHandlers({
  createBanner: db.createBanner,
  listBanners: db.listBanners,
  getBannerById: db.getBannerById,
  updateBanner: db.updateBanner,
  deleteBanner: db.deleteBanner,
  toggleBanner: db.toggleBanner,
});

router.use(requireJwtAuth, requireAdminAccess);

router.post('/', requireManageBanners, handlers.createBanner);
router.get('/', requireReadBanners, handlers.listBanners);
router.get('/:id', requireReadBanners, handlers.getBanner);
router.put('/:id', requireManageBanners, handlers.updateBanner);
router.delete('/:id', requireManageBanners, handlers.deleteBanner);
router.patch('/:id/toggle', requireManageBanners, handlers.toggleBanner);

module.exports = router;
