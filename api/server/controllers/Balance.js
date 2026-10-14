const { createBalanceHandlers } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const {
  findBalanceByUser,
  findPendingBalanceRequestByUser,
  createBalanceRequest,
  reserveBalance,
} = require('~/models');

const handlers = createBalanceHandlers({
  findBalanceByUser,
  findPendingBalanceRequestByUser,
  createBalanceRequest,
  getAppConfig,
  reserveBalance,
});

module.exports = handlers;
