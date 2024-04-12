const express = require('express');
const router = express.Router();
const { updatePreference, getPreference } = require('../services/UserService');
const { requireJwtAuth } = require('../middleware/');

router.put('/', requireJwtAuth, async (req, res) => {
  console.log('pref.js PUT BEFORE',req.user.id, req.body);
  await updatePreference({ userId: req.user.id, ...req.body });
  console.log('pref.js PUT AFTER',req.user.id, req.body);
  res.status(201).send();
});

router.get('/', requireJwtAuth, async (req, res) => {
  const { name } = req.query;
  console.log('pref.js GET BEFORE', name);
  const response = await getPreference({ userId: req.user.id, name });
  console.log('pref.js GET AFTER', name);
  res.status(200).send(response);
});

module.exports = router;
