const axios = require('axios');
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const denyRequest = require('./denyRequest');

async function moderateText(req, res, next) {
  if (!isEnabled(process.env.OPENAI_MODERATION)) {
    return next();
  }
  try {
    const { text, quotes } = req.body;

    /**
     * Moderate the typed text plus any quoted excerpts. Quotes are merged into
     * the model-facing user message downstream, so a crafted `quotes` payload
     * must be moderated too. The moderation API accepts an array of inputs.
     */
    const inputs = [];
    if (typeof text === 'string' && text.length > 0) {
      inputs.push(text);
    }
    if (Array.isArray(quotes)) {
      for (const quote of quotes) {
        if (typeof quote === 'string' && quote.length > 0) {
          inputs.push(quote);
        }
      }
    }
    const input = inputs.length > 1 ? inputs : (inputs[0] ?? text);

    const response = await axios.post(
      process.env.OPENAI_MODERATION_REVERSE_PROXY || 'https://api.openai.com/v1/moderations',
      {
        input,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_MODERATION_API_KEY}`,
        },
      },
    );

    const results = response.data.results;
    const flagged = results.some((result) => result.flagged);

    if (flagged) {
      const type = ErrorTypes.MODERATION;
      const errorMessage = { type };
      return await denyRequest(req, res, errorMessage);
    }
  } catch (error) {
    logger.error('Error in moderateText:', error);
    const errorMessage = 'error in moderation check';
    return await denyRequest(req, res, errorMessage);
  }
  next();
}

module.exports = moderateText;
