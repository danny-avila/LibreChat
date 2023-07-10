require('dotenv').config();
const { createOpenAPIChain } = require('langchain/chains');

(async function() {
  const response = await fetch('https://scholar-ai.net/.well-known/ai-plugin.json');
  const data = await response.json();
  console.log(data);

  const yaml = data.api.url;
  const query = 'Can you find and explain some articles about the intersection of AI and VR?';

  // const yaml = "https://api.speak.com/openapi.yaml";
  // const query = `How would you say no thanks in Russian?`;

  const chain = await createOpenAPIChain(yaml, {
    verbose: true,
    params: {
      sort: 'cited_by_count',
    }
  });
  const result = await chain.run(query);
  console.log('api chain run result', result);
  return result;
})();
