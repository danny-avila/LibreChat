const { shouldApplyNoIndex } = require('../utils/publicAuthIndexing');

const noIndex = (req, res, next) => {
  if (shouldApplyNoIndex(req)) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }

  next();
};

module.exports = noIndex;
