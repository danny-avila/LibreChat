const express = require('express');
const router = express.Router();
const endpointController = require('~/server/controllers/EndpointController');
const overrideController = require('~/server/controllers/OverrideController');

router.get('/', async (req, res, next) => {
  if (process.env.NO_AUTH_MODE === 'true') {
    try {
      const { getEndpointsConfig } = require('~/server/services/Config');
      const cfg = await getEndpointsConfig(req);
      // keep only google
      const { google } = cfg;
      res.send(JSON.stringify({ google }));
    } catch (e) {
      next(e);
    }
    return;
  }
  return endpointController(req, res);
});
router.get('/config/override', overrideController);

module.exports = router;
