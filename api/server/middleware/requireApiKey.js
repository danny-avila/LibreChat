const { validateApiKey } = require('../services/ApiKeyService');

const requireApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  const userId = await validateApiKey(apiKey);
  if (!userId) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }

  req.userId = userId;
  return next();
};

module.exports = requireApiKey;
