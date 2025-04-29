const { validateApiKey } = require('../services/ApiKeyService');

const requireApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  let userId;
  try {
    userId = await validateApiKey(apiKey);
  } catch (err) {
    const error = JSON.parse(err.message);
    if (error.type === 'API_KEY_INVALID') {
      return res.status(401).json({ error: 'Invalid API key' });
    } else if (error.type === 'API_KEY_EXPIRED') {
      return res.status(403).json({ error: 'API key expired' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!userId) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  req.userId = userId;
  return next();
};

module.exports = requireApiKey;
