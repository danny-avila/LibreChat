require('dotenv').config();
(async () => {
  const { ChatGPTAPI } = await import('chatgpt');

  const api = new ChatGPTAPI({ apiKey: process.env.OPENAI_KEY });

  // send a message and wait for the response
  let res = await api.sendMessage('What is OpenAI?');
  console.log(res);
})();
