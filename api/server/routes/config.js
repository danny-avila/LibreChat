const express = require('express');
const router = express.Router();

router.get('/', async function (req, res) {
  try {
    const appTitle = process.env.APP_TITLE || 'AITok Chat';
    const googleLoginEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
    const serverDomain = process.env.DOMAIN_SERVER || 'http://localhost:3080';
    const registrationEnabled = process.env.ALLOW_REGISTRATION || true;
    
    return res.status(200).send({appTitle, googleLoginEnabled, serverDomain, registrationEnabled});
  } catch (err) {
    console.error(err);
    return res.status(500).send({error: err.message});
  }
});

module.exports = router;
