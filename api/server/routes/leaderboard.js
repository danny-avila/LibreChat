const express = require('express');
const requireJwtAuth = require('../../middleware/requireJwtAuth');

const router = express.Router();

router.get('/', requireJwtAuth, () => {});

module.exports = router;
