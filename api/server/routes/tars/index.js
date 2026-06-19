const express = require('express');
const domains = require('./domains');
const knowledge = require('./knowledge');

const router = express.Router();
router.use('/', domains);
router.use('/', knowledge);

module.exports = router;
