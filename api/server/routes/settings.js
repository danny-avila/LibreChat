const express = require('express');
const {
  updateFavoritesController,
  getFavoritesController,
} = require('~/server/controllers/FavoritesController');
const {
  getSkillStatesController,
  updateSkillStatesController,
} = require('~/server/controllers/SkillStatesController');
const { updateLocationController } = require('~/server/controllers/LocationController');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

router.get('/favorites', requireJwtAuth, getFavoritesController);
router.post('/favorites', requireJwtAuth, updateFavoritesController);
router.get('/skills/active', requireJwtAuth, getSkillStatesController);
router.post('/skills/active', requireJwtAuth, updateSkillStatesController);
router.patch('/location', requireJwtAuth, updateLocationController);

module.exports = router;
