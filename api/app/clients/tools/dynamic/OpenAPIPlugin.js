require('dotenv').config();
const fs = require('fs');
const { z } = require('zod');
const path = require('path');
const yaml = require('js-yaml');
const { createOpenAPIChain } = require('langchain/chains');
const { DynamicStructuredTool } = require('langchain/tools');
const { ChatPromptTemplate, HumanMessagePromptTemplate } = require('langchain/prompts');
const { logger } = require('~/config');

function addLinePrefix(text, prefix = '// ') {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

function createPrompt(name, functions) {
  const prefix = `// The ${name} tool has the following functions. Determine the desired or most optimal function for the user's query:`;
  const functionDescriptions = functions
    .map((func) => `// - ${func.name}: ${func.description}`)
    .join('\n');
  return `${prefix}\n${functionDescriptions}
// You are an expert manager and scrum master. You must provide a detailed intent to better execute the function.
// Always format as such: {{"func": "function_name", "intent": "intent and expected result"}}`;
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
    logger.error('[readSpecFile] error', e);
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

async function createOpenAPIPlugin({ data, llm, user, message, memory, signal }) {
  let spec;
  try {
    spec = await getSpec(data.api.url);
  } catch (error) {
    logger.error('[createOpenAPIPlugin] getSpec error', error);
    return null;
  }

  if (!spec) {
    logger.warn('[createOpenAPIPlugin] No spec found');
    return null;
  }

  const headers = {};
  const { auth, name_for_model, description_for_model, description_for_human } = data;
  if (auth && AuthDefinition.parse(auth)) {
    logger.debug('[createOpenAPIPlugin] auth detected', auth);
    const { openai } = auth.verification_tokens;
    if (AuthBearer.parse(auth)) {
      headers.authorization = `Bearer ${openai}`;
      logger.debug('[createOpenAPIPlugin] added auth bearer', headers);
    }
  }

  const chainOptions = { llm };

  if (data.headers && data.headers['librechat_user_id']) {
    logger.debug('[createOpenAPIPlugin] id detected', headers);
    headers[data.headers['librechat_user_id']] = user;
  }

  if (Object.keys(headers).length > 0) {
    logger.debug('[createOpenAPIPlugin] headers detected', headers);
    chainOptions.headers = headers;
  }

  if (data.params) {
    logger.debug('[createOpenAPIPlugin] params detected', data.params);
    chainOptions.params = data.params;
  }

  let history = '';
  if (memory) {
    logger.debug('[createOpenAPIPlugin] openAPI chain: memory detected', memory);
    const { history: chat_history } = await memory.loadMemoryVariables({});
    history = chat_history?.length > 0 ? `\n\n## Chat History:\n${chat_history}\n` : '';
  }

  chainOptions.prompt = ChatPromptTemplate.fromMessages([
    HumanMessagePromptTemplate.fromTemplate(
      `# Use the provided API's to respond to this query:\n\n{query}\n\n## Instructions:\n${addLinePrefix(
        description_for_model,
      )}${history}`,
    ),
  ]);

  const chain = await createOpenAPIChain(spec, chainOptions);

  const { functions } = chain.chains[0].lc_kwargs.llmKwargs;

  return new DynamicStructuredTool({
    name: name_for_model,
    description_for_model: `${addLinePrefix(description_for_human)}${createPrompt(
      name_for_model,
      functions,
    )}`,
    description: `${description_for_human}`,
    schema: z.object({
      func: z
        .string()
        .describe(
          `The function to invoke. The functions available are: ${functions
            .map((func) => func.name)
            .join(', ')}`,
        ),
      intent: z
        .string()
        .describe('Describe your intent with the function and your expected result'),
    }),
    func: async ({ func = '', intent = '' }) => {
      const filteredFunctions = functions.filter((f) => f.name === func);
      chain.chains[0].lc_kwargs.llmKwargs.functions = filteredFunctions;
      const query = `${message}${func?.length > 0 ? `\n// Intent: ${intent}` : ''}`;
      const result = await chain.call({
        query,
        signal,
      });
      return result.response;
    },
  });
}

module.exports = {
  getSpec,
  readSpecFile,
  createOpenAPIPlugin,
};
