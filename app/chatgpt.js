require('dotenv').config();
const Keyv = require('keyv');
const messageStore = new Keyv(process.env.MONGODB_URI, { namespace: 'chatgpt' });

const ask = async (question, progressCallback, convo) => {
  const { ChatGPTAPI } = await import('chatgpt');
  const api = new ChatGPTAPI({ apiKey: process.env.OPENAI_KEY, messageStore });
  let options = {
    onProgress: (partialRes) => {
      if (partialRes.text.length > 0) {
        progressCallback(partialRes);
      }
    }
  };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  const res = await api.sendMessage(question, options);
  return res;
};

module.exports = { ask };