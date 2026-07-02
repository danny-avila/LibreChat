const express = require('express');
const router = express.Router();

const {
  getStatesController,
  getDistrictsController,
  getSubdistrictsController,
  getVillagesController,
} = require('~/server/controllers/LocationController');

router.get('/states', getStatesController);
router.get('/districts', getDistrictsController);
router.get('/subdistricts', getSubdistrictsController);
router.get('/villages', getVillagesController);

module.exports = router;
