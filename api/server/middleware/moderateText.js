const axios = require('axios');
const { ErrorTypes } = require('librechat-data-provider');
const denyRequest = require('./denyRequest');
const { logger } = require('~/config');

async function moderateText(req, res, next) {
  if (process.env.OPENAI_MODERATION === 'true') {
    try {
      const { text } = req.body;

      const response = await axios.post(
        process.env.OPENAI_MODERATION_REVERSE_PROXY || 'https://api.openai.com/v1/moderations',
        {
          input: text,
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
  }
  next();
}

module.exports = moderateText;
