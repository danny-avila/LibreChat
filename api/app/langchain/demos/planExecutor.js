require('dotenv').config();
const { Calculator } = require('langchain/tools/calculator');
const { SerpAPI } = require('langchain/tools');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { PlanAndExecuteAgentExecutor } = require('langchain/experimental/plan_and_execute');

const tools = [
  new Calculator(),
  new SerpAPI(process.env.SERPAPI_API_KEY || '', {
    location: 'Austin,Texas,United States',
    hl: 'en',
    gl: 'us'
  })
];
const model = new ChatOpenAI({
  temperature: 0,
  modelName: 'gpt-3.5-turbo',
  verbose: true,
  openAIApiKey: process.env.OPENAI_API_KEY
});
const executor = PlanAndExecuteAgentExecutor.fromLLMAndTools({
  llm: model,
  tools
});

(async () => {
  const result = await executor.call({
    input: `Who is the current president of the United States? What is their current age raised to the second power?`
  });

  console.log({ result });
})();
