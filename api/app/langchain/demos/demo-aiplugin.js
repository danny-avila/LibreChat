require('dotenv').config();
const { ChatOpenAI } = require( "langchain/chat_models/openai");
const { initializeAgentExecutorWithOptions } = require( "langchain/agents");
const HttpRequestTool = require('../tools/HttpRequestTool');
const AIPluginTool = require('../tools/AIPluginTool');

const run = async () => {
  const openAIApiKey = process.env.OPENAI_API_KEY;
  const tools = [
    new HttpRequestTool(),
    await AIPluginTool.fromPluginUrl(
      "https://www.klarna.com/.well-known/ai-plugin.json", new ChatOpenAI({ temperature: 0, openAIApiKey })
    ),
  ];
  const agent = await initializeAgentExecutorWithOptions(
    tools,
    new ChatOpenAI({ temperature: 0, openAIApiKey }),
    { agentType: "chat-zero-shot-react-description", verbose: true }
  );

  const result = await agent.call({
    input: "what t shirts are available in klarna?",
  });

  console.log({ result });
};

(async () => {
  await run();
})();

