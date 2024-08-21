const express = require('express');

const oneWeekInSeconds = 24 * 60 * 60 * 7;

const sMaxAge = process.env.STATIC_CACHE_S_MAX_AGE || oneWeekInSeconds;
const maxAge = process.env.STATIC_CACHE_MAX_AGE || oneWeekInSeconds * 4;

const staticCache = (staticPath) =>
  express.static(staticPath, {
    setHeaders: (res) => {
      if (process.env.NODE_ENV?.toLowerCase() !== 'production') {
        return;
      }

      res.setHeader('Cache-Control', `public, max-age=${maxAge}, s-maxage=${sMaxAge}`);
    },
  });

module.exports = staticCache;
