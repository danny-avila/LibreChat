require('dotenv').config();
const connectDb = require('../../lib/db/connectDb');
const ChatAgent = require('./agent');
const { validateTools } = require('./tools');

(async () => {
  await connectDb();
  const openAIApiKey = process.env.OPENAI_KEY;
  const chatAgent = new ChatAgent(openAIApiKey, {
    tools: validateTools(['dall-e']),
    debug: true,
    modelOptions: {
      // model: 'gpt-4',
    },
  });

  const input1 = `Write me a poem in the style of Hemingway and then generate an image based on it.`;
  // const input1 = `Write me a weather report for today's weather in NYC.`;
  const output1 = await chatAgent.sendMessage(input1);

  console.log(`[1] Got output`);
  console.dir(output1, { depth: null });
  
})();
