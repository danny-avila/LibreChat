const express = require('express');
const router = express.Router();

const paid = require('./paid');

router.use('/paid', paid);

module.exports = router;
