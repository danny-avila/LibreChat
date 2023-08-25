const express = require('express');
const router = express.Router();
const { requireJwtAuth } = require('../middleware');
const User = require('../../models/User');

router.post('/api/saveapi', requireJwtAuth, async (req, res) => {
  const { endpoint, tempApi } = req.body;

  try {
    await User.saveApiSettings(req.user.id, { endpoint, tempApi });

    res.send({ message: 'API settings updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

module.exports = router;
