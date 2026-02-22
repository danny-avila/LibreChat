const noIndex = (req, res, next) => {
  const shouldNoIndex = process.env.NO_INDEX ? process.env.NO_INDEX === 'true' : true;

  if (shouldNoIndex) {
    res.setHeader('X-Robots-Tag', 'noindex');
  }

  next();
};

module.exports = noIndex;
