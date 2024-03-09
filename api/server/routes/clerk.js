const express = require('express');
const userController = require('../controllers/clerk/UserController');

const router = express.Router();

router.post('/user', userController);

module.exports = router;
