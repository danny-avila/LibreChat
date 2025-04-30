const axios = require('axios');
const { logger } = require('~/config');

async function omnexioBalanceController(req, res) {
  try {
    const { OMNEXIO_BASE_URL, OMNEXIO_API_KEY } = process.env;

    const url = `${OMNEXIO_BASE_URL}/v1/chat-users/${req.user.id}`;
    const response = await axios.get(url,{
      headers: {
        'Authorization': `Bearer ${OMNEXIO_API_KEY}`,
      },
    });

    if (response.data && response.data.credits !== undefined) {
      return res.status(200).send('' + response.data.credits);
    } else {
      logger.warn('[omnexioBalanceController] Invalid response format from Omnexio API');
      return res.status(200).send('0');
    }
  } catch (error) {
    logger.error('[omnexioBalanceController] Error fetching balance:', error);
    // Return 0 as a fallback instead of exposing the error to the client
    return res.status(200).send('0');
  }
}

module.exports = omnexioBalanceController;
