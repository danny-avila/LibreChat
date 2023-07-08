const express = require('express');
const requireJwtAuth = require('../../middleware/requireJwtAuth');
const User = require('../../models/User');

const router = express.Router();

async function getNumOfReferrals() {
  try {
    const dbResponse = await User.find().sort({ numOfReferrals: -1 }).limit(100).exec();
    const finalResponse = [];

    for (let i = 0; i < dbResponse.length; i++) {
      let id = dbResponse[i].id;
      let name = dbResponse[i].name;
      let username = dbResponse[i].username;
      let numOfReferrals = dbResponse[i].numOfReferrals;
      finalResponse.push({ id, name, username, numOfReferrals });
    }

    return finalResponse;
  } catch (error) {
    console.log(error);
    return { message: 'Error getting conversations' };
  }
}

router.get('/', requireJwtAuth, async (req, res) => {
  res.status(200).send(await getNumOfReferrals());
});

module.exports = router;
