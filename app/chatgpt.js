require('dotenv').config();

const ask = async (question) => {
  const { ChatGPTAPI } = await import('chatgpt');
  const api = new ChatGPTAPI({ apiKey: process.env.OPENAI_KEY });
  const res = await api.sendMessage(question, {
    onProgress: (partialRes) => console.log(partialRes.text)
  });
  return res;
};

module.exports = { ask };