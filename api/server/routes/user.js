const express = require('express');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const { getUserController, updateUserPluginsController } = require('../controllers/UserController');

const router = express.Router();

router.get('/:userId?', requireJwtAuth, getUserController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);

module.exports = router;
