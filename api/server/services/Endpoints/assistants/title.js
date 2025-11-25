const { isEnabled, sanitizeTitle } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { saveConvo } = require('~/models/Conversation');
const getLogStores = require('~/cache/getLogStores');
const initializeClient = require('./initalize');

/**
 * Generates a conversation title using OpenAI SDK
 * @param {Object} params
 * @param {OpenAI} params.openai - The OpenAI SDK client instance
 * @param {string} params.text - User's message text
 * @param {string} params.responseText - Assistant's response text
 * @returns {Promise<string>}
 */
const generateTitle = async ({ openai, text, responseText }) => {
  const titlePrompt = `Please generate a concise title (max 40 characters) for a conversation that starts with:
User: ${text}
Assistant: ${responseText}

Title:`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'user',
        content: titlePrompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 20,
  });

  const title = completion.choices[0]?.message?.content?.trim() || 'New conversation';
  return sanitizeTitle(title);
};

/**
 * Adds a title to a conversation asynchronously
 * @param {ServerRequest} req
 * @param {Object} params
 * @param {string} params.text - User's message text
 * @param {string} params.responseText - Assistant's response text
 * @param {string} params.conversationId - Conversation ID
 */
const addTitle = async (req, { text, responseText, conversationId }) => {
  const { TITLE_CONVO = 'true' } = process.env ?? {};
  if (!isEnabled(TITLE_CONVO)) {
    return;
  }

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${conversationId}`;

  try {
    const { openai } = await initializeClient({ req });
    const title = await generateTitle({ openai, text, responseText });
    await titleCache.set(key, title, 120000);

    await saveConvo(
      req,
      {
        conversationId,
        title,
      },
      { context: 'api/server/services/Endpoints/assistants/addTitle.js' },
    );
  } catch (error) {
    logger.error('[addTitle] Error generating title:', error);
    const fallbackTitle = text.length > 40 ? text.substring(0, 37) + '...' : text;
    await titleCache.set(key, fallbackTitle, 120000);
    await saveConvo(
      req,
      {
        conversationId,
        title: fallbackTitle,
      },
      { context: 'api/server/services/Endpoints/assistants/addTitle.js' },
    );
  }
};

module.exports = addTitle;
