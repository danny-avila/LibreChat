const express = require('express');
const { createSetBalanceConfig, createUpdatePersonalSpendLimit } = require('@librechat/api');
const router = express.Router();
const controller = require('../controllers/Balance');
const { requireJwtAuth } = require('../middleware/');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

const updatePersonalSpendLimit = createUpdatePersonalSpendLimit({
  upsertBalanceFields,
  findBalanceByUser,
});

router.get('/', requireJwtAuth, setBalanceConfig, controller);
router.patch('/personal-limit', requireJwtAuth, setBalanceConfig, updatePersonalSpendLimit);

module.exports = router;
