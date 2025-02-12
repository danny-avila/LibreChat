const express = require('express');

const router = express.Router();
const {
  setHeaders,
  handleAbort,
  validateModel,
  // validateEndpoint,
  buildEndpointOption,
} = require('~/server/middleware');
const validateConvoAccess = require('~/server/middleware/validate/convoAccess');
const validateAssistant = require('~/server/middleware/assistants/validate');
const chatController = require('~/server/controllers/assistants/chatV2');

router.post('/abort', handleAbort());

/**
 * @route POST /
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post(
  '/',
  validateModel,
  buildEndpointOption,
  validateAssistant,
  validateConvoAccess,
  setHeaders,
  chatController,
);

module.exports = router;
