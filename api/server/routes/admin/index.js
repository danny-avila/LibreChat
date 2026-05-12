const express = require('express');

const router = express.Router();

router.use('/overview', require('./overview'));
router.use('/users', require('./users'));
router.use('/subscription', require('./subscription'));
router.use('/balance', require('./balance'));
router.use('/usage', require('./usage'));
router.use('/messages', require('./messages'));
router.use('/audit', require('./audit'));

module.exports = router;
