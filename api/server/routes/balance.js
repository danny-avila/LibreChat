const express = require('express');
const router = express.Router();
const {
  balanceController,
  balanceUpdateController,
  getBalanceByEmailController,
} = require('../controllers/Balance');
const { requireJwtAuth, checkAdmin } = require('../middleware/');

router.get('/', requireJwtAuth, balanceController);
router.post('/getByEmail', requireJwtAuth, getBalanceByEmailController);
router.post('/update', requireJwtAuth, checkAdmin, balanceUpdateController);

module.exports = router;
