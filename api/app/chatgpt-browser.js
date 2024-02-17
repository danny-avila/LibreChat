require('dotenv').config();
const { KeyvFile } = require('keyv-file');
const { Constants } = require('librechat-data-provider');
const { getUserKey, checkUserKeyExpiry } = require('../server/services/UserService');

const browserClient = async ({
  text,
  parentMessageId,
  conversationId,
  model,
  key: expiresAt,
  onProgress,
  onEventMessage,
  abortController,
  userId,
}) => {
  const isUserProvided = process.env.CHATGPT_TOKEN === 'user_provided';

  let key = null;
  if (expiresAt && isUserProvided) {
    checkUserKeyExpiry(
      expiresAt,
      'Your ChatGPT Access Token has expired. Please provide your token again.',
    );
    key = await getUserKey({ userId, name: 'chatGPTBrowser' });
  }

  const { ChatGPTBrowserClient } = await import('nodejs-gpt');
  const store = {
    store: new KeyvFile({ filename: './data/cache.json' }),
  };

  const clientOptions = {
    // Warning: This will expose your access token to a third party. Consider the risks before using this.
    reverseProxyUrl:
      process.env.CHATGPT_REVERSE_PROXY ?? 'https://ai.fakeopen.com/api/conversation',
    // Access token from https://chat.openai.com/api/auth/session
    accessToken: isUserProvided ? key : process.env.CHATGPT_TOKEN ?? null,
    model: model,
    debug: false,
    proxy: process.env.PROXY ?? null,
    user: userId,
  };

  const client = new ChatGPTBrowserClient(clientOptions, store);
  let options = { onProgress, onEventMessage, abortController };

  if (!!parentMessageId && !!conversationId) {
    options = { ...options, parentMessageId, conversationId };
  }

  if (parentMessageId === Constants.NO_PARENT) {
    delete options.conversationId;
  }

  const res = await client.sendMessage(text, options);
  return res;
};

module.exports = { browserClient };
