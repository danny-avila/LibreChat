const express = require('express');
const router = express.Router();
const { checkAdmin } = require('../middleware/roles');
const requireJwtAuth = require('../middleware/requireJwtAuth');
const usersController = require('../controllers/admin/users');
const settingsController = require('../controllers/admin/settings');
const statsController = require('../controllers/admin/stats');

// Apply auth and admin check to all routes
router.use(requireJwtAuth);
router.use(checkAdmin);

// User Routes
router.post('/users', usersController.createUser);
router.get('/users', usersController.getUsers);
router.get('/users/:id', usersController.getUser);
router.put('/users/:id', usersController.updateUser);
router.delete('/users/:id', usersController.deleteUser);

// Settings Routes
router.get('/settings', settingsController.getSettings);
router.put('/settings', settingsController.updateSettings);

// Stats Routes
router.get('/stats', statsController.getStats);

module.exports = router;
