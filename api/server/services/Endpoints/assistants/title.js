const { isEnabled, sanitizeTitle, recordUsage } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const getLogStores = require('~/cache/getLogStores');
const initializeClient = require('./initalize');
const db = require('~/models');
const { saveConvo } = db;

/**
 * Generates a conversation title using OpenAI SDK
 * @param {Object} params
 * @param {OpenAI} params.openai - The OpenAI SDK client instance
 * @param {string} params.text - User's message text
 * @param {string} params.responseText - Assistant's response text
 * @param {ServerRequest} [params.req] - Express request (used to bill title-gen tokens)
 * @param {string} [params.conversationId] - Tagged on the title-gen transaction
 * @returns {Promise<string>}
 */
const generateTitle = async ({ openai, text, responseText, req, conversationId }) => {
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

  // Record title-gen token usage. Always lightweight (max_tokens=20) but
  // accumulates across all conversations. Model name comes from the provider
  // response so configurations using gpt-4o-mini etc. are billed correctly.
  const usage = completion?.usage;
  if (req?.user?.id && usage && (usage.prompt_tokens || usage.completion_tokens)) {
    await recordUsage(db, {
      user: req.user.id,
      model: completion?.model || 'gpt-3.5-turbo',
      context: 'title',
      conversationId,
      balance: req?.config?.balance,
      transactions: req?.config?.transactions,
      tokenUsage: {
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0,
      },
    });
  }

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

  // Skip title generation for temporary conversations
  if (req?.body?.isTemporary) {
    return;
  }

  const titleCache = getLogStores(CacheKeys.GEN_TITLE);
  const key = `${req.user.id}-${conversationId}`;

  try {
    const { openai } = await initializeClient({ req });
    const title = await generateTitle({ openai, text, responseText, req, conversationId });
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
