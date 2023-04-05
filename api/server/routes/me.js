const express = require('express');
const router = express.Router();
const userSystemEnabled = !!process.env.ENABLE_USER_SYSTEM || false;

router.get('/', function (req, res) {
  if (userSystemEnabled) {
    const user = req?.session?.user;

    if (user) res.send(JSON.stringify({ username: user?.username, display: user?.display }));
    else res.send(JSON.stringify(null));
  } else {
    res.send(JSON.stringify({ username: 'anonymous_user', display: 'Anonymous User' }));
  }
});

module.exports = router;
