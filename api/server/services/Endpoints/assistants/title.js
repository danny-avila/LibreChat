const { isEnabled, sanitizeTitle } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const initializeClient = require('./initalize');
const { saveConvo } = require('~/models');
const { recordUsage } = require('~/server/services/Threads');

/**
 * Generates a conversation title using OpenAI SDK
 * @param {Object} params
 * @param {OpenAI} params.openai - The OpenAI SDK client instance
 * @param {string} params.text - User's message text
 * @param {string} params.responseText - Assistant's response text
 * @returns {Promise<{ title: string, usage: Object, model: string }>}
 */
const generateTitle = async ({ openai, text, responseText }) => {
  const titlePrompt = `Please generate a concise title (max 40 characters) for a conversation that starts with:
User: ${text}
Assistant: ${responseText}

Title:`;

  const response = await openai.responses.create({
    model: 'gpt-5.4-nano',
    input: titlePrompt,
    max_output_tokens: 20,
    store: false,
  });

  const title = response.output_text?.trim() || 'New conversation';
  return {
    title: sanitizeTitle(title),
    usage: response.usage || {},
    model: response.model || 'gpt-5.4-nano',
  };
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

  // Skip title generation for temporary conversations
  if (req?.body?.isTemporary) {
    return;
  }

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${conversationId}`;

  try {
    const { openai } = await initializeClient({ req });
    const titleResult = await generateTitle({ openai, text, responseText });
    const title = titleResult.title;
    try {
      await recordUsage({
        prompt_tokens: titleResult.usage.prompt_tokens || titleResult.usage.input_tokens || 0,
        completion_tokens: titleResult.usage.completion_tokens || titleResult.usage.output_tokens || 0,
        model: titleResult.model,
        user: req?.user?.id,
        conversationId,
        context: 'title',
      });
    } catch (usageError) {
      logger.error('[addTitle] Error recording title usage:', usageError);
    }
    await titleCache.set(key, title, 120000);

    const reqCtx = {
      userId: req?.user?.id,
      isTemporary: req?.body?.isTemporary,
      interfaceConfig: req?.config?.interfaceConfig,
    };
    await saveConvo(
      reqCtx,
      {
        conversationId,
        title,
      },
      { context: 'api/server/services/Endpoints/assistants/addTitle.js', noUpsert: true },
    );
  } catch (error) {
    logger.error('[addTitle] Error generating title:', error);
    const fallbackTitle = text.length > 40 ? text.substring(0, 37) + '...' : text;
    await titleCache.set(key, fallbackTitle, 120000);
    await saveConvo(
      {
        userId: req?.user?.id,
        isTemporary: req?.body?.isTemporary,
        interfaceConfig: req?.config?.interfaceConfig,
      },
      {
        conversationId,
        title: fallbackTitle,
      },
      { context: 'api/server/services/Endpoints/assistants/addTitle.js', noUpsert: true },
    );
  }
};

module.exports = addTitle;
