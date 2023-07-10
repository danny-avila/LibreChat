require('dotenv').config();
const { initializeAgentExecutorWithOptions } = require('langchain/agents');
const { ChatOpenAI } = require('langchain/chat_models/openai');
const { loadSpecs } = require('../../util/loadSpecs');

(async function() {
  const query = 'Can you find and explain some articles about the intersection of AI and VR?';
  const llm = new ChatOpenAI({ modelName: 'gpt-4-0613', temperature: 0, openAIApiKey: process.env.OPENAI_API_KEY });
  const plugins = await loadSpecs({ llm, verbose: true });
  const executor = await initializeAgentExecutorWithOptions(
    plugins,
    llm,
    {
      agentType: 'openai-functions',
      verbose: true,
    }
  );

  const result = await executor.run(query);
  console.log(result);
})();
