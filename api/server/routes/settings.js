const express = require('express');
const { createToolFavoritesHandlers, createPinnedOrderHandlers } = require('@librechat/api');
const {
  updateFavoritesController,
  getFavoritesController,
} = require('~/server/controllers/FavoritesController');
const {
  getSkillStatesController,
  updateSkillStatesController,
} = require('~/server/controllers/SkillStatesController');
const { requireJwtAuth } = require('~/server/middleware');
const {
  getToolFavorites,
  addToolFavorite,
  removeToolFavorite,
  getUserById,
  updateUser,
} = require('~/models');

const router = express.Router();

const toolFavorites = createToolFavoritesHandlers({
  getToolFavorites,
  addToolFavorite,
  removeToolFavorite,
});

const pinnedOrder = createPinnedOrderHandlers({ getUserById, updateUser });

router.get('/favorites/tools', requireJwtAuth, toolFavorites.listToolFavorites);
router.put('/favorites/tools/:itemType/:itemId', requireJwtAuth, toolFavorites.addToolFavorite);
router.delete(
  '/favorites/tools/:itemType/:itemId',
  requireJwtAuth,
  toolFavorites.removeToolFavorite,
);
router.get('/favorites', requireJwtAuth, getFavoritesController);
router.post('/favorites', requireJwtAuth, updateFavoritesController);
router.get('/pinned-order', requireJwtAuth, pinnedOrder.getPinnedOrder);
router.post('/pinned-order', requireJwtAuth, pinnedOrder.updatePinnedOrder);
router.get('/skills/active', requireJwtAuth, getSkillStatesController);
router.post('/skills/active', requireJwtAuth, updateSkillStatesController);

module.exports = router;
