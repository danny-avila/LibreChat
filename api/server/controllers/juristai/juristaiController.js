// api/server/controllers/juristaiController.js
const juristaiService = require('~/services/juristaiService');
const { logger } = require('~/config');

exports.createMessage = async (req, res) => {
  try {
    logger.info('[/juristai/create] Request payload:', req.body);
    const response = await juristaiService.addMessageToThread(req.body);
    res.json(response);
  } catch (error) {
    logger.error('[/juristai/create] Error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
};
