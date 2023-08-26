require('dotenv').config();
const { z } = require('zod');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const { DynamicStructuredTool } = require('langchain/tools');
const { createOpenAPIChain } = require('langchain/chains');
const { ChatPromptTemplate, HumanMessagePromptTemplate } = require('langchain/prompts');

function createPrompt(name, functions) {
  const prefix = `// The ${name} tool has the following functions. Determine the desired or most optimal function for the user's query:`;
  const functionDescriptions = functions
    .map((func) => `// - ${func.name}: ${func.description}`)
    .join('\n');
  return `${prefix}\n${functionDescriptions}
// The user's message will be passed as a natural language query to be used with the function.
// Always provide the function name as such: {{"func": "function_name"}}`;
}

const AuthBearer = z
  .object({
    type: z.string().includes('service_http'),
    authorization_type: z.string().includes('bearer'),
    verification_tokens: z.object({
      openai: z.string(),
    }),
  })
  .catch(() => false);

const AuthDefinition = z
  .object({
    type: z.string(),
    authorization_type: z.string(),
    verification_tokens: z.object({
      openai: z.string(),
    }),
  })
  .catch(() => false);

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
  const RegularUrl = z
    .string()
    .url()
    .catch(() => false);

  if (RegularUrl.parse(url) && path.extname(url) === '.json') {
    const response = await fetch(url);
    return await response.json();
  }

  const ValidSpecPath = z
    .string()
    .url()
    .catch(async () => {
      const spec = path.join(__dirname, '..', '.well-known', 'openapi', url);
      if (!fs.existsSync(spec)) {
        return false;
      }

      return await readSpecFile(spec);
    });

  return ValidSpecPath.parse(url);
}

async function createOpenAPIPlugin({ data, llm, user, message, verbose = false }) {
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
  }

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

  const chainOptions = {
    llm,
    verbose,
  };

  if (data.headers && data.headers['librechat_user_id']) {
    verbose && console.debug('id detected', headers);
    headers[data.headers['librechat_user_id']] = user;
  }

  if (Object.keys(headers).length > 0) {
    verbose && console.debug('headers detected', headers);
    chainOptions.headers = headers;
  }

  if (data.params) {
    verbose && console.debug('params detected', data.params);
    chainOptions.params = data.params;
  }

  chainOptions.prompt = ChatPromptTemplate.fromPromptMessages([
    HumanMessagePromptTemplate.fromTemplate(
      `# Use the provided API's to respond to this query:\n\n{query}\n\n## Instructions:\n${description_for_model.replaceAll(
        '\n',
        '\n// ',
      )}`,
    ),
  ]);

  const chain = await createOpenAPIChain(spec, chainOptions);
  const { functions } = chain.chains[0].lc_kwargs.llmKwargs;

  return new DynamicStructuredTool({
    name: data.name_for_model,
    description_for_model: createPrompt(data.name_for_model, functions),
    description: `${data.description_for_human}`,
    schema: z.object({
      func: z
        .string()
        .describe(
          `The function to invoke. The functions available are: ${functions
            .map((func) => func.name)
            .join(', ')}`,
        ),
    }),
    func: async ({ func = '' }) => {
      const result = await chain.run(`${message}${func?.length > 0 ? `\nUse ${func}` : ''}`);
      console.log('api chain run result', result);
      return result;
    },
  });
}

module.exports = {
  getSpec,
  readSpecFile,
  createOpenAPIPlugin,
};
