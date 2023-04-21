require('dotenv').config();
const connectDb = require('../../lib/db/connectDb');
const ChatAgent = require('./agent');

const openAIApiKey = process.env.OPENAI_KEY;
(async () => {
  await connectDb();
  // const conversationId = 'your_conversation_id_here'; // Replace this with the actual conversationId
  const chatAgent = new ChatAgent(openAIApiKey, { serpapiApiKey: process.env.SERPAPI_API_KEY });
  // const chatAgent = new ChatAgent(openAIApiKey);

  const input1 = "can you read me comments on this video? https://www.youtube.com/watch?v=kSLcedGSez8";

  const output1 = await chatAgent.sendMessage(input1);

  console.log(`[1] Got output`);
  console.dir(output1, { depth: null });

  // const input2 = 'are there any seagreen blue shirts?';
  // const options = {
  //   conversationId: output1.conversationId,
  //   parentMessageId: output1.messageId,
  //   // conversationId: '467a14a7-a30a-4453-bf5f-dae743100db4',
  //   // parentMessageId: '97706707-5c9e-485d-843f-4ce4570aa577',
  // };

  // console.log(`[2] Sending with options:`);
  // console.dir(options, { depth: null });
  // const output2 = await chatAgent.sendMessage(input2, options);

  // console.log(`[2] Got output`);
  // console.dir(output2, { depth: null });

  // const input3 = "What are some top trending articles on the internet today about bitcoin?";
  // const input3 = "What is the word of the day on thefreedictionary.com?";
  // const output3 = await chatAgent.sendMessage(input3);
})();
