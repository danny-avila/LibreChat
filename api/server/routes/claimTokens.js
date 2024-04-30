const express = require('express');
const router = express.Router();
const claimTokensController = require('../controllers/claimTokensController');
const requireJwtAuth = require('../middleware/requireJwtAuth');

router.post('/', requireJwtAuth, claimTokensController.claimTokens);

module.exports = router;
