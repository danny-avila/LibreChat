const express = require('express');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const { getUserController, updateUserPluginsController, getAllUsersController, deleteUserController, updateUserController, createUserController } = require('../controllers/UserController');

const router = express.Router();

router.get('/', requireJwtAuth, getUserController);
router.post('/', requireJwtAuth, createUserController);
router.delete('/', requireJwtAuth, deleteUserController);
router.put('/', requireJwtAuth, updateUserController);
router.get('/users', requireJwtAuth, getAllUsersController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);

module.exports = router;
