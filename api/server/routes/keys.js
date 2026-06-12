const express = require('express');
const { createUserKeyHandlers } = require('@librechat/api');
const { updateUserKey, deleteUserKey, getUserKeyExpiry, getUserKeyValues } = require('~/models');
const { requireJwtAuth } = require('~/server/middleware');

const router = express.Router();

const handlers = createUserKeyHandlers({
  updateUserKey,
  deleteUserKey,
  getUserKeyExpiry,
  getUserKeyValues,
});

router.put('/', requireJwtAuth, handlers.update);

router.delete('/:name', requireJwtAuth, handlers.remove);

router.delete('/', requireJwtAuth, handlers.removeAll);

router.get('/', requireJwtAuth, handlers.get);

module.exports = router;
