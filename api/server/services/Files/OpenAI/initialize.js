const OpenAI = require('openai');

/**
 * Initializes and returns an instance of the OpenAI client.
 *
 * @returns {OpenAI} An instance of the OpenAI client.
 */
function initializeOpenAI() {
  // TODO: needs to be initialized with `initializeClient` to allow for customization
  return new OpenAI(process.env.OPENAI_API_KEY);
}

module.exports = initializeOpenAI;
