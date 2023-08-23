const express = require('express');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const { getUserController, updateUserPluginsController, followUserController } = require('../controllers/UserController');

const router = express.Router();

router.get('/:userId?', requireJwtAuth, getUserController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.post('/follow', requireJwtAuth, followUserController);

module.exports = router;
