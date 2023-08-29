const express = require('express');
const router = express.Router();
const { updateUserKey, deleteUserKey } = require('../services/UserService');
const { requireJwtAuth } = require('../middleware/');

// UPDATE
router.put('/', requireJwtAuth, async (req, res) => {
  await updateUserKey({ userId: req.user.id, ...req.body });
  res.status(201).send();
});

// DELETE
router.delete('/', requireJwtAuth, async (req, res) => {
  await deleteUserKey({ userId: req.user.id, ...req.body });
  res.status(204).send();
});

module.exports = router;
