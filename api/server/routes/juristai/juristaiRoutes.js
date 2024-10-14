const express = require('express');
const router = express.Router();
const juristaiController = require('../../controllers/juristaiController');

// Define el endpoint principal para juristai
router.post('/create', juristaiController.createMessage);

module.exports = router;