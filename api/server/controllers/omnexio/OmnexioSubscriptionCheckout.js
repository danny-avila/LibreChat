const axios = require('axios');
const { logger } = require('~/config');

async function omnexioSubscriptionCheckoutController(req, res) {
  try {
    const { OMNEXIO_BASE_URL, OMNEXIO_API_KEY } = process.env;

    const payload = {
      username: req.user.id,
      subscription_plan_id: req.body.subscription_plan_id,
    };

    const url = `${OMNEXIO_BASE_URL}/v1/subscriptions/checkout`;
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${OMNEXIO_API_KEY}`,
      },
    });

    if (response.data && response.data.url !== undefined) {
      return res.status(200).send('' + response.data.url);
    } else {
      logger.warn(
        '[omnexioSubscriptionCheckoutController] Invalid response format from Omnexio API',
      );
      return res.status(200).send('');
    }
  } catch (error) {
    logger.error('[omnexioSubscriptionCheckoutController] Error fetching checkout url:', error);
    // Return 0 as a fallback instead of exposing the error to the client
    return res.status(200).send('');
  }
}

module.exports = omnexioSubscriptionCheckoutController;
