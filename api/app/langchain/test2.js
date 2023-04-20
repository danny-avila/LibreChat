require('dotenv').config();
const connectDb = require('../../lib/db/connectDb');
const ChatAgent = require('./agent');

const openAIApiKey = process.env.OPENAI_KEY;
(async () => {
  await connectDb();
  // const conversationId = 'your_conversation_id_here'; // Replace this with the actual conversationId
  // const chatAgent = new ChatAgent(openAIApiKey, { serpapiApiKey: process.env.SERPAPI_API_KEY });
  const chatAgent = new ChatAgent(openAIApiKey);
  

  const input1 = "What is today's date, and what date is 20 days from now?";
  const input3 = "What is the word of the day on merriam webster. What is the top result on google for that word";
  // const input3 = "What is the word of the day on thefreedictionary.com?";
  const output3 = await chatAgent.sendMessage(input3);
  // const output1 = await chatAgent.sendMessage(input1);

  // const input2 = 'can you add 20 days to the latest date you gave me?';
  // const options = {
  //   conversationId: 'c6a87cca-b899-4f98-84a7-e9e24b029a1a',
  //   parentMessageId: '767618c1-c9ff-47ba-a8f8-1866695a6977'
  // };
  // const output1 = await chatAgent.sendMessage(input2, options);

  console.log(`Got output`);
  console.dir(output3, { depth: null });
})();
