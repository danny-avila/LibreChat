const OpenAI = require('openai');
const { ErrorTypes } = require('librechat-data-provider');
const { isEnabled } = require('~/server/utils');
const denyRequest = require('./denyRequest');
const { logger } = require('~/config');

/**
 * Middleware to moderate text content using OpenAI's moderation API
 * @param {Express.Request} req - Express request object
 * @param {Express.Response} res - Express response object
 * @param {Express.NextFunction} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function moderateText(req, res, next) {
  if (!isEnabled(process.env.OPENAI_MODERATION)) {
    return next();
  }

  try {
    const moderationKey = process.env.OPENAI_MODERATION_API_KEY;

    if (!moderationKey) {
      logger.error('Missing OpenAI moderation API key');
      return denyRequest(req, res, { message: 'Moderation configuration error' });
    }

    const openai = new OpenAI({
      apiKey: moderationKey,
    });

    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return denyRequest(req, res, { type: ErrorTypes.VALIDATION, message: 'Invalid text input' });
    }

    const response = await openai.moderations.create({
      model: 'omni-moderation-latest',
      input: text,
    });

    if (!Array.isArray(response.results)) {
      throw new Error('Invalid moderation API response format');
    }

    const flagged = response.results.some((result) => result.flagged);

    if (flagged) {
      return denyRequest(req, res, {
        type: ErrorTypes.MODERATION,
        message: 'Content violates moderation policies',
      });
    }

    next();
  } catch (error) {
    logger.error('Moderation error:', {
      error: error.message,
      stack: error.stack,
      status: error.response?.status,
    });

    return denyRequest(req, res, {
      type: ErrorTypes.MODERATION,
      message: 'Content moderation check failed',
    });
  }
}

module.exports = moderateText;
