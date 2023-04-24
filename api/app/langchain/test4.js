require('dotenv').config();
const connectDb = require('../../lib/db/connectDb');
const ChatAgent = require('./agent');

const openAIApiKey = process.env.OPENAI_KEY;
(async () => {
  await connectDb();
  const chatAgent = new ChatAgent(openAIApiKey, { serpapiApiKey: process.env.SERPAPI_API_KEY, zapierApiKey: process.env.ZAPIER_NLA_API_KEY });

  const input1 = `In the "Prim-Tech" board, in the "To Do" list, Create a new card called "Phase 2: Deliverables" which has a checklist with all the following items:

"Create your service

Initialize your API server
    Build out the framework for your service
    Setup your server-side application and related tools
    Consider using Docker to build and deploy your service

Define the routes expected by your API
    Reference the API Documentation in the FEC READMEs
    Use the API in your selected FEC's project development server.

!callout-danger Your new server should be a drop-in replacement for the development server, not necessarily for the Ateleir API !end-callout

Integrate your server and primary database.
    Define your database queries
    Implement needed server logic

Advanced optional content: integrate your server and your second database
    Define your database queries
    Implement needed server logic

Write unit tests and integration tests to cover your working service.
    Write unit tests to confirm your server side logic.
    Create integration tests to identify connection issues.
    Consider using an API Testing Framework

Integrate your front end with your API
    Confirm that your new API successfully replaces all functionality of the legacy system."
  `;
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
