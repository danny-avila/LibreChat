const express = require('express');
const router = express.Router();

router.get('/', async function (req, res) {
 
  const googleLoginEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  const serverDomain = process.env.DOMAIN_SERVER || 'http://localhost:3080';
  const registrationEnabled = process.env.ALLOW_REGISTRATION === 'true';
  
  return res.status(200).send({googleLoginEnabled, serverDomain, registrationEnabled});
});

module.exports = router;
