const axios = require('axios');
const { isEnabled, getReferencedQuotes, mergeQuotedText } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const denyRequest = require('./denyRequest');

async function moderateText(req, res, next) {
  if (!isEnabled(process.env.OPENAI_MODERATION)) {
    return next();
  }
  try {
    const { text } = req.body;

    /**
     * Moderate the typed text, each quoted excerpt, and the merged blockquote+text
     * exactly as the model receives it. Quotes are normalized via
     * `getReferencedQuotes` first (matching `BaseClient`); moderating the merged
     * string also covers content split across a quote and the typed body. The
     * moderation API accepts an array of inputs.
     */
    const safeText = typeof text === 'string' ? text : '';
    const inputs = [];
    if (safeText.length > 0) {
      inputs.push(safeText);
    }
    const quotes = getReferencedQuotes(req.body.quotes);
    if (quotes != null) {
      inputs.push(...quotes);
      inputs.push(mergeQuotedText(safeText, quotes));
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
