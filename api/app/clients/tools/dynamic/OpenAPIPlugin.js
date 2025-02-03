require('dotenv').config();
const fs = require('fs');
const { z } = require('zod');
const path = require('path');
const yaml = require('js-yaml');
const { createOpenAPIChain } = require('langchain/chains');
const { DynamicStructuredTool } = require('@langchain/core/tools');
const { ChatPromptTemplate, HumanMessagePromptTemplate } = require('@langchain/core/prompts');
const { logger } = require('~/config');

function addLinePrefix(text, prefix = '// ') {
  return text
    .split('\n')
    .map((line) => prefix + line)
    .join('\n');
}

/**
 * Creates a meta-prompt explaining the available functions and how the LLM
 * should respond with the correct JSON.
 */
function createPrompt(name, functions) {
  const prefix = `// The ${name} tool has the following functions. Determine the desired or most optimal function for the user's query:`;
  const functionDescriptions = functions
    .map((func) => `// - ${func.name}: ${func.description}`)
    .join('\n');
  return `${prefix}\n${functionDescriptions}
// You are an expert manager and scrum master. You must provide a detailed intent to better execute the function.
// Always format as such: {{"func": "function_name", "intent": "intent and expected result"}}`;
}

// Old approach for "service_http" type w/ "bearer" tokens
const AuthBearer = z
  .object({
    type: z.string().includes('service_http'),
    authorization_type: z.string().includes('bearer'),
    verification_tokens: z.object({
      openai: z.string(),
    }),
  })
  .catch(() => false);

/**
 * Older style "AuthDefinition" that checks for "verification_tokens" object
 */
const AuthDefinition = z
  .object({
    type: z.string(),
    authorization_type: z.string(),
    verification_tokens: z.object({
      openai: z.string(),
    }),
  })
  .catch(() => false);

/**
 * New approach for "oauth2" usage — expects an access_token (optional).
 * The handshake/redirect should happen elsewhere (you handle code->token).
 * Once you have a token, pass { type: 'oauth2', access_token: '...' } here.
 */
const AuthOAuth2 = z
  .object({
    type: z.string().includes('oauth2'),
    access_token: z.string().optional(),
  })
  .catch(() => false);

/**
 * Reads a local file (JSON or YAML) and returns its content parsed.
 */
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

/**
 * Attempts to load an OpenAPI spec from:
 *  1. A remote JSON file if URL is valid and ends with .json
 *  2. Otherwise, attempts a local path in .well-known/openapi/<url>
 */
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

/**
 * Creates a "tool" that can be used by an LLM to call the specified OpenAPI spec.
 * It handles:
 *  - optional memory (chat history)
 *  - optional service_http/bearer or OAuth2 auth
 *  - building the correct chain/prompt
 */
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

  // Prepare headers for the requests
  const headers = {};
  const { auth, name_for_model, description_for_model, description_for_human } = data;

  // -- Check if we have the older "service_http + bearer" style
  if (auth && AuthDefinition.parse(auth)) {
    logger.debug('[createOpenAPIPlugin] auth (service_http) detected', auth);
    const { openai } = auth.verification_tokens || {};
    if (AuthBearer.parse(auth)) {
      headers.authorization = `Bearer ${openai}`;
      logger.debug('[createOpenAPIPlugin] added auth bearer', headers);
    }
  }

  // -- Check if we have an OAuth2 token
  const maybeOAuth2 = AuthOAuth2.parse(auth);
  if (maybeOAuth2) {
    logger.debug('[createOpenAPIPlugin] OAuth2 auth detected', auth);
    if (maybeOAuth2.access_token) {
      headers.authorization = `Bearer ${maybeOAuth2.access_token}`;
      logger.debug('[createOpenAPIPlugin] Using OAuth2 bearer token', headers);
    }
  }
  const chainOptions = { llm };

  if (data.headers && data.headers['librechat_user_id']) {
    logger.debug('[createOpenAPIPlugin] id detected', headers);
    headers[data.headers['librechat_user_id']] = user;
  }

  if (Object.keys(headers).length > 0) {
    logger.debug('[createOpenAPIPlugin] final headers:', headers);
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
      chain.chains[0].lc_kwargs.llmKwargs.functions = functions.filter((f) => f.name === func);
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
