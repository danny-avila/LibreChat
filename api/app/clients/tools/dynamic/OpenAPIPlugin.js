require('dotenv').config();
const { z } = require('zod');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { DynamicStructuredTool } = require('langchain/tools');
const { createOpenAPIChain } = require('langchain/chains');

async function readSpecFile(filePath) {
  try {
    const fileContents = await fs.promises.readFile(filePath, 'utf8');
    if (path.extname(filePath) === '.json') {
      return JSON.parse(fileContents);
    }
    return yaml.load(fileContents);
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function getSpec(url) {
  const regularUrl = z.string().url();
  try {
    if (regularUrl.parse(url) && path.extname(url) === '.json') {
      const response = await fetch(url);
      return await response.json();
    }
  } catch (error) {
    console.log('not a json url');
  }

  const validSpecPath = z.string().url().catch(async () => {
    const spec = path.join(__dirname, '..', '.well-known', 'openapi', url);
    if (!fs.existsSync(spec)) {
      return false;
    }

    return await readSpecFile(spec);
  });

  return validSpecPath.parse(url);
}

async function createOpenAPIPlugin({ data, llm, verbose = false }) {
  // TODO: url handling
  // const response = await fetch('https://scholar-ai.net/.well-known/ai-plugin.json');
  // const data = await response.json();
  // console.log(data);

  let spec;
  try {
    spec = await getSpec(data.api.url, verbose);
  } catch (error) {
    verbose && console.debug('getSpec error', error);
    return null;
  }

  if (!spec) {
    verbose && console.debug('No spec found');
    return null;
  };

  return new DynamicStructuredTool({
    name: data.name_for_model,
    description: data.description_for_human,
    schema: z.object({
      query: z.string().describe('For your query, be specific in a conversational manner. It will be interpreted by a human.'),
      variables: z.string().describe(`Define necessary variables to supplement query in a machine-readable format.
  Anticipate required parameters for the API plugin call.
  Plugin Description: ${data.description_for_model}`).optional(),
    }),
    func: async ({ query, variables }) => {
      const chainOptions = {
        llm,
        verbose,
      };

      if (data.params) {
        verbose && console.debug('params detected', data.params);
        chainOptions.params = data.params;
      }

      if (variables) {
        query += variables;
      }

      const chain = await createOpenAPIChain(spec, chainOptions);
      const result = await chain.run(query);
      console.log('api chain run result', result);
      return result;
    }
  });
}

module.exports = {
  createOpenAPIPlugin,
};