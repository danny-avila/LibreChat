const express = require('express');
const router = express.Router();
const { updateUserKey, deleteUserKey, getUserKeyExpiry } = require('../services/UserService');
const { setCurrentUser, requireSubscription } = require('../middleware/');
const { ClerkExpressRequireAuth } = require('@clerk/clerk-sdk-node');

router.use(ClerkExpressRequireAuth(), setCurrentUser, requireSubscription);
router.put('/', async (req, res) => {
  await updateUserKey({ userId: req.user.id, ...req.body });
  res.status(201).send();
});

router.delete('/:name', async (req, res) => {
  const { name } = req.params;
  await deleteUserKey({ userId: req.user.id, name });
  res.status(204).send();
});

router.delete('/', async (req, res) => {
  const { all } = req.query;

  if (all !== 'true') {
    return res.status(400).send({ error: 'Specify either all=true to delete.' });
  }

  await deleteUserKey({ userId: req.user.id, all: true });

  res.status(204).send();
});

router.get('/', async (req, res) => {
  const { name } = req.query;
  const response = await getUserKeyExpiry({ userId: req.user.id, name });
  res.status(200).send(response);
});

module.exports = router;
