const express = require('express');
const router = express.Router();

const {
  getStatesController,
  getDistrictsController,
  getSubdistrictsController,
  getVillagesController,
} = require('~/server/controllers/LocationController');

router.get('/status', (req, res) => {
  res.status(200).send({
    hasApiKey: !!(process.env.LGD_API_KEY || process.env.LGD_VILLAGES_API_KEY),
    hasStatesUrl: !!process.env.LGD_STATES_API_URL,
    hasDistrictsUrl: !!process.env.LGD_DISTRICTS_API_URL,
    hasSubdistrictsUrl: !!process.env.LGD_SUBDISTRICTS_API_URL,
    hasVillagesUrl: !!process.env.LGD_VILLAGES_API_URL,
  });
});

router.get('/states', getStatesController);
router.get('/districts', getDistrictsController);
router.get('/subdistricts', getSubdistrictsController);
router.get('/villages', getVillagesController);

module.exports = router;
