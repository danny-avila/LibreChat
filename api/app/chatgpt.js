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

const titleConvo = async (message, response, model) => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY
  });
  const openai = new OpenAIApi(configuration);
  const completion = await openai.createCompletion({
    model: 'text-davinci-002',
    prompt: `Rédigez un titre court en majuscules, idéalement en 5 mots ou moins, et ne faites pas référence à l'utilisateur ou ${model}, qui résume cette conversation:\nUser:"${message}"\n${model}:"${response}"\nTitle: `
  });

  return completion.data.choices[0].text.replace(/\n/g, '');
};

module.exports = { ask, titleConvo };
