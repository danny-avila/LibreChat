/* eslint-disable no-unused-vars */
require('dotenv').config();
const { z } = require('zod');
const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { ChatOpenAI } = require('langchain/chat_models/openai');
// const { Calculator } = require('langchain/tools/calculator');
const { DynamicStructuredTool } = require('langchain/tools');
const { createOpenAPIChain } = require('langchain/chains');

(async function() {
  const response = await fetch('https://scholar-ai.net/.well-known/ai-plugin.json');
  const data = await response.json();
  console.log(data);

  const yaml = data.api.url;
  const query = 'Can you find and explain some articles about the intersection of AI and VR?';

  // const yaml = "https://api.speak.com/openapi.yaml";
  // const query = `How would you say no thanks in Russian?`;

  const chain = await createOpenAPIChain(yaml);
  const result = await chain.run(query);
  console.log('api chain run result', result);
  return result;

  // const Plugin = new DynamicStructuredTool({
  //   name: data.name_for_model,
  //   description: data.description_for_model,
  //   schema: z.object({
  //     query: z.string().describe(`Natural language query for API; description: ${data.description_for_human}`)
  //   }),
  //   func: async ({ query }) => {
  //     const chain = await createOpenAPIChain(yaml);
  //     const result = await chain.run(query);
  //     console.log('api chain run result', result);
  //     return result;
  //   }
  // });

  // const executor = await initializeAgentExecutorWithOptions(
  //   [Plugin],
  //   new ChatOpenAI({ modelName: 'gpt-4-0613', temperature: 0, openAIApiKey: process.env.OPENAI_API_KEY }),
  //   {
  //     agentType: 'openai-functions',
  //     verbose: true,
  //   }
  // );

  // const result = await executor.run('Can you find and explain some articles about the intersection of AI and VR?');
  // console.log(result);

})();
