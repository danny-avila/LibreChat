const express = require('express');
const paths = require('~/config/paths');

const router = express.Router();
router.use(express.static(paths.imageOutput));

module.exports = router;
