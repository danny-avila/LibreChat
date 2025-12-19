const serverless = require('serverless-http');
let handler;

module.exports = async (req, res) => {
  try {
    if (!handler) {
      const { createApp } = require('./server/vercel-app');
      const app = await createApp();
      handler = serverless(app);
    }
    return handler(req, res);
  } catch (err) {
    console.error('Vercel function init error:', err);
    res.status(500).json({ error: 'Server initialization failed' });
  }
};
