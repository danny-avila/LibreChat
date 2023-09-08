const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { getResponseSender } = require('../routes/endpoints/schemas');
const { saveMessage } = require('../../models');
const { handleError } = require('../utils');
const buildEndpointOption = require('./buildEndpointOption');

const windowMs = (process.env?.QUESTION_WINDOW ?? 60) * 60 * 1000; // default: 60 minutes
const max = process.env?.QUESTION_MAX ?? 350; // default: limit each IP to 350 requests per windowMs
const windowInMinutes = windowMs / 60000;

/**
 * Respond with an error message and save it.
 */
const respondWithError = async (sender, conversationId, parentMessageId, error, res) => {
  const errorMessage = {
    sender,
    messageId: crypto.randomUUID(),
    conversationId,
    parentMessageId,
    unfinished: false,
    cancelled: false,
    error: true,
    final: true,
    text: error.message,
    isCreatedByUser: false,
  };

  await saveMessage(errorMessage);
  handleError(res, errorMessage);
};

/**
 * Rate limit handler for excessive requests.
 */
function handler(req, res) {
  buildEndpointOption(req, res, () => {});

  const { endpointOption, conversationId, parentMessageId = null } = req.body;
  const errorText = `You've asked too many questions in a short time. Please wait for ${windowInMinutes} minutes before asking another question.`;

  return respondWithError(
    getResponseSender(endpointOption),
    conversationId,
    parentMessageId,
    new Error(errorText),
    res,
  );
}

const questionLimiter = rateLimit({
  windowMs,
  max,
  handler,
});

module.exports = questionLimiter;
