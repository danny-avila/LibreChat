const express = require('express');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const User = require('../../models/User');

const router = express.Router();

router.get('/', requireJwtAuth, async (req, res) => {
  const dbResponse = await User.find({ numOfReferrals: { $gt: 0 }}, { _id: 0, name: 1, username: 1, numOfReferrals: 1 })
    .limit(100)
    .sort({ numOfReferrals: -1 })
    .exec();
  res.status(200).send(dbResponse);
});

module.exports = router;
