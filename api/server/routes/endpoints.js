const express = require('express');
const router = express.Router();
const endpointController = require('~/server/controllers/EndpointController');
const overrideController = require('~/server/controllers/OverrideController');

router.get('/', endpointController);
router.get('/override', overrideController);

module.exports = router;
