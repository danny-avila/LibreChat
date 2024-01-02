const express = require('express');
const EditController = require('~/server/controllers/EditController');
const { initializeClient } = require('~/server/services/Endpoints/openAI');
const {
  handleAbort,
  setHeaders,
  validateEndpoint,
  buildEndpointOption,
  moderateText,
} = require('~/server/middleware');

const router = express.Router();
router.use(moderateText);
router.post('/abort', handleAbort());

router.post('/', validateEndpoint, buildEndpointOption, setHeaders, async (req, res, next) => {
  await EditController(req, res, next, initializeClient);
});

module.exports = router;
