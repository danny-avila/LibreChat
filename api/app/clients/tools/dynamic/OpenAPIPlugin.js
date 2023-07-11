require('dotenv').config();
const { z } = require('zod');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { DynamicStructuredTool } = require('langchain/tools');
const { createOpenAPIChain } = require('langchain/chains');
const SUFFIX = 'Prioritize utilizing API response parts in subsequent requests before fulfilling the query.';

const AuthBearer = z.object({
  type: z.string().includes('service_http'),
  authorization_type: z.string().includes('bearer'),
  verification_tokens: z.object({
    openai: z.string(),
  })
}).catch(() => false);

const AuthDefinition = z.object({
  type: z.string(),
  authorization_type: z.string(),
  verification_tokens: z.object({
    openai: z.string(),
  })
}).catch(() => false);

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
  const RegularUrl = z.string().url().catch(() => false);

  if (RegularUrl.parse(url) && path.extname(url) === '.json') {
    const response = await fetch(url);
    return await response.json();
  }

  const ValidSpecPath = z.string().url().catch(async () => {
    const spec = path.join(__dirname, '..', '.well-known', 'openapi', url);
    if (!fs.existsSync(spec)) {
      return false;
    }

    return await readSpecFile(spec);
  });

  return ValidSpecPath.parse(url);
}

async function createOpenAPIPlugin({ data, llm, user, message, verbose = false }) {
  // TODO: load Spec from url
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

  const headers = {};
  const { auth, description_for_model } = data;
  if (auth && AuthDefinition.parse(auth)) {
    verbose && console.debug('auth detected', auth);
    const { openai } = auth.verification_tokens;
    if (AuthBearer.parse(auth)) {
      headers.authorization = `Bearer ${openai}`;
      verbose && console.debug('added auth bearer', headers);
    }
  }

  return new DynamicStructuredTool({
    name: data.name_for_model,
    description: `${data.description_for_human}`,
    schema: z.object({
      query: z.string().describe('For the query, be specific in a conversational manner. It will be interpreted by a human.'),
    }),
    func: async () => {
      const chainOptions = {
        llm,
        verbose,
      };

      if (data.headers && data.headers.id) {
        verbose && console.debug('id detected', headers);
        headers[data.headers.id] = user;
      }

      if (Object.keys(headers).length > 0) {
        verbose && console.debug('headers detected', headers);
        chainOptions.headers = headers;
      }

      if (data.params) {
        verbose && console.debug('params detected', data.params);
        chainOptions.params = data.params;
      }

      const chain = await createOpenAPIChain(spec, chainOptions);
      const result = await chain.run(`${message}\n\n||>Instructions: ${description_for_model}\n${SUFFIX}`);
      console.log('api chain run result', result);
      return result;
    }
  });
}

module.exports = {
  createOpenAPIPlugin,
};