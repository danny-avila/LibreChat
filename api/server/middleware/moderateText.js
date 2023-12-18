const axios = require('axios');
const CircularJSON = require('circular-json-es6');
const denyRequest = require('./denyRequest');

async function moderateText(req, res, next) {
  if (process.env.OPENAI_MODERATION === 'true') {
    try {
      const { text } = req.body;
      const textWithoutCircular = CircularJSON.stringify(text);

      const response = await axios.post(
        process.env.OPENAI_MODERATION_REVERSE_PROXY || 'https://api.openai.com/v1/moderations',
        {
          input: textWithoutCircular,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.OPENAI_MODERATION_API_KEY}`,
          },
        },
      );

      console.log('response', response.data);

      const results = response.data.results;
      const flagged = results.some((result) => result.flagged);

      if (flagged) {
        const errorMessage = 'message is against moderation';
        return await denyRequest(req, res, errorMessage);
      }
    } catch (error) {
      console.error('Error in moderateText:', error);
      const errorMessage = 'error in moderation check';
      return await denyRequest(req, res, errorMessage);
    }
  }
  next();
}

module.exports = moderateText;
