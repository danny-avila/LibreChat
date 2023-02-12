require('dotenv').config();
const Keyv = require('keyv');
const { Configuration, OpenAIApi } = require('openai');
const messageStore = new Keyv(process.env.MONGODB_URI, { namespace: 'chatgpt' });

const ask = async (question, progressCallback, convo) => {
  const { ChatGPTAPI } = await import('chatgpt');
  const api = new ChatGPTAPI({ apiKey: process.env.OPENAI_KEY, messageStore });
  let options = {
    onProgress: async (partialRes) => {
      if (partialRes.text.length > 0) {
        await progressCallback(partialRes);
      }
    }
  };

  if (!!convo.parentMessageId && !!convo.conversationId) {
    options = { ...options, ...convo };
  }

  const res = await api.sendMessage(question, options);
  return res;
};

const titleConvo = async (message, response) => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY
  });
  const openai = new OpenAIApi(configuration);
  const completion = await openai.createCompletion({
    model: 'text-davinci-002',
    prompt: `Write a short title in title case, ideally in 5 words or less, and do not refer to the user or GPT, that summarizes this conversation:\nUser:"${message}"\nGPT:"${response}"\nTitle: `
  });

  return completion.data.choices[0].text.replace(/\n/g, '');
};

module.exports = { ask, titleConvo };
