const axios = require('axios');
const { logger } = require('~/config');

async function omnexioSubscriptionChangeController(req, res) {
  try {
    const { OMNEXIO_BASE_URL, OMNEXIO_API_KEY } = process.env;

    const payload = {
      id: req.body.subscription_plan_id,
    };

    const url = `${OMNEXIO_BASE_URL}/v1/chat-users/${req.user.id}/subscription-plan`;
    const response = await axios.put(url, payload, {
      headers: {
        Authorization: `Bearer ${OMNEXIO_API_KEY}`,
      },
    });

    return res.status(200).send('');
  } catch (error) {
    logger.error('[omnexioSubscriptionChangeController] Error fetching checkout url:', error);
    // Return 0 as a fallback instead of exposing the error to the client
    return res.status(200).send('');
  }
}

module.exports = omnexioSubscriptionChangeController;
