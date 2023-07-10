require('dotenv').config();
const { z } = require('zod');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { DynamicStructuredTool } = require('langchain/tools');
const { createOpenAPIChain } = require('langchain/chains');

async function readYamlFile(filePath) {
  try {
    const fileContents = await fs.promises.readFile(filePath, 'utf8');
    const data = yaml.load(fileContents);
    return data;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function getSpec(url) {
  const validSpecPath = z.string().url().catch(async () => {
    const spec = path.join(__dirname, '..', '.well-known', 'openapi', url);
    if (!fs.existsSync(spec)) {
      return false;
    }

    return await readYamlFile(spec);
  });

  return validSpecPath.parse(url);
}

async function createOpenAPIPlugin({ data, llm, verbose = false }) {
  // TODO: url handling
  // const response = await fetch('https://scholar-ai.net/.well-known/ai-plugin.json');
  // const data = await response.json();
  // console.log(data);

  let yaml;
  try {
    yaml = await getSpec(data.api.url, verbose);
  } catch (error) {
    verbose && console.log('getSpec error', error);
    return null;
  }

  if (!yaml) {
    verbose && console.log('No yaml found');
    return null;
  };

  return new DynamicStructuredTool({
    name: data.name_for_model,
    description: data.description_for_model,
    schema: z.object({
      query: z.string().describe(`Natural language query for API: ${data.description_for_human}`)
    }),
    func: async ({ query }) => {
      const chainOptions = {
        llm,
        verbose,
      };

      if (data.params) {
        verbose && console.log('params detected', data.params);
        chainOptions.params = data.params;
      }

      const chain = await createOpenAPIChain(yaml, chainOptions);
      const result = await chain.run(query);
      console.log('api chain run result', result);
      return result;
    }
  });
}

module.exports = {
  createOpenAPIPlugin,
};