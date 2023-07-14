require('dotenv').config();
const { z } = require('zod');
const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { DynamicStructuredTool } = require('langchain/tools');
const { createOpenAPIChain } = require('langchain/chains');

(async function () {
  const response = await fetch('https://scholar-ai.net/.well-known/ai-plugin.json');
  const data = await response.json();
  console.log(data);

  const yaml = data.api.url;
  const query = 'Can you find and explain some articles about the intersection of AI and VR?';

  const Plugin = new DynamicStructuredTool({
    name: data.name_for_model,
    description: data.description_for_model,
    schema: z.object({
      query: z.string().describe(`Natural language query for API: ${data.description_for_human}`),
    }),
    func: async ({ query }) => {
      const chain = await createOpenAPIChain(yaml, {
        verbose: true,
        // params: {
        //   sort: 'cited_by_count',
        // }
      });
      const result = await chain.run(query);
      console.log('api chain run result', result);
      return result;
    },
  });

  const executor = await initializeAgentExecutorWithOptions(
    [Plugin],
    new ChatOpenAI({
      modelName: 'gpt-4-0613',
      temperature: 0,
      openAIApiKey: process.env.OPENAI_API_KEY,
    }),
    {
      agentType: 'openai-functions',
      verbose: true,
    },
  );

  const result = await executor.run(query);
  console.log(result);
})();
