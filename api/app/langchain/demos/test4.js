require('dotenv').config();
const connectDb = require('../../lib/db/connectDb');
const ChatAgent = require('./agent');

const openAIApiKey = process.env.OPENAI_KEY;
(async () => {
  await connectDb();
  // const chatAgent = new ChatAgent(openAIApiKey, { serpapiApiKey: process.env.SERPAPI_API_KEY, zapierApiKey: process.env.ZAPIER_NLA_API_KEY });
  // const chatAgent = new ChatAgent(openAIApiKey, { serpapiApiKey: process.env.SERPAPI_API_KEY, });
  const chatAgent = new ChatAgent(openAIApiKey);

  const input1 = `What are some good restaurants in San Francisco that do take out?`;
  const output1 = await chatAgent.sendMessage(input1);

  console.log(`[1] Got output`);
  console.dir(output1, { depth: null });

  // const input2 = 'can you divide that number in half?';
  // const options = {
  //   conversationId: output1.conversationId,
  //   parentMessageId: output1.messageId,
  //   // conversationId: '165e8adb-67d9-4eea-afac-ab7df9ca7bc3',
  //   // parentMessageId: '3e6a8135-282d-4177-9c13-de8acc993218',
  // };

  // // // console.log(`[2] Sending with options:`);
  // // // console.dir(options, { depth: null });
  // const output2 = await chatAgent.sendMessage(input2, options);
  // console.log(`[2] Got output`);
  // console.dir(output2, { depth: null });

  // const options2 = {
  //   conversationId: output2.conversationId,
  //   parentMessageId: output2.messageId,
  // };

  // const input3 = "Whats the national Anthem of that nation?";
  // const output3 = await chatAgent.sendMessage(input3, options2);
  // console.dir(output3, { depth: null });

  // const options3 = {
  //   conversationId: output3.conversationId,
  //   parentMessageId: output3.messageId,
  // };

  // const input4 = "Thank you, you're awesome!";
  // const output4 = await chatAgent.sendMessage(input4, options3);
  // console.dir(output4, { depth: null });
})();
