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
  listBanners: db.listBanners,
  countBanners: db.countBanners,
  findBannerById: db.findBannerById,
  createBanner: db.createBanner,
  updateBannerById: db.updateBannerById,
  deleteBannerById: db.deleteBannerById,
});

router.use(requireJwtAuth, requireAdminAccess);

router.get('/', requireReadBanners, handlers.listBanners);
router.post('/', requireManageBanners, handlers.createBanner);
router.get('/:id', requireReadBanners, handlers.getBanner);
router.patch('/:id', requireManageBanners, handlers.updateBanner);
router.delete('/:id', requireManageBanners, handlers.deleteBanner);

module.exports = router;
