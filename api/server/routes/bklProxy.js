const express = require('express');
const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

const router = express.Router();

const BKL_BASE_URL = process.env.BKL_API_BASE_URL || 'http://bkl-api:8000';

router.use(async (req, res) => {
  const targetUrl = `${BKL_BASE_URL}${req.originalUrl.replace(/^\/bkl/, '')}`;

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : req.body,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        Accept: req.headers['accept'] || 'application/json',
      },
      timeout: 60_000,
      validateStatus: () => true,
      responseType: 'arraybuffer',
    });

    const contentType = response.headers['content-type'];
    if (contentType) {
      res.setHeader('content-type', contentType);
    }
    res.status(response.status).send(response.data);
  } catch (err) {
    logger.error('[bklProxy] Failed to reach BKL API:', err?.message || err);
    res.status(502).json({
      error: 'BKL API upstream error',
      detail: err?.message || String(err),
    });
  }
});

module.exports = router;
