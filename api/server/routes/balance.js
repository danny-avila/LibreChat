const express = require('express');
const router = express.Router();
const {
  balanceController,
  balanceUpdateController,
  getBalanceByEmailController,
} = require('../controllers/Balance');
const { requireJwtAuth } = require('../middleware/');

router.get('/', requireJwtAuth, balanceController);
router.post('/getByEmail', requireJwtAuth, getBalanceByEmailController);
router.post('/update', requireJwtAuth, balanceUpdateController);

module.exports = router;
