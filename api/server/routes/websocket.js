const express = require('express');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');
const router = express.Router();

router.get('/', optionalJwtAuth, async (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';

  const protocol = isProduction && req.secure ? 'https' : 'http';

  const serverDomain = process.env.SERVER_DOMAIN
    ? process.env.SERVER_DOMAIN.replace(/^https?:\/\//, '')
    : req.headers.host;

  const socketIoUrl = `${protocol}://${serverDomain}`;

  res.json({ url: socketIoUrl });
});

module.exports = router;
