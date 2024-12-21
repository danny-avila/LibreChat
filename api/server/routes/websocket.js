const express = require('express');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const router = express.Router();

router.get('/', optionalJwtAuth, async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const useSSL = isProduction && process.env.SERVER_DOMAIN?.startsWith('https');

  const protocol = useSSL ? 'wss' : 'ws';
  const serverDomain = process.env.SERVER_DOMAIN
    ? process.env.SERVER_DOMAIN.replace(/^https?:\/\//, '')
    : req.headers.host;
  const wsUrl = `${protocol}://${serverDomain}/ws`;

  res.json({ url: wsUrl });
});

module.exports = router;
