const {
  CacheKeys,
  Constants,
  AuthTypeEnum,
  actionDelimiter,
  isImageVisionTool,
  actionDomainSeparator,
} = require('librechat-data-provider');
const { tool } = require('@langchain/core/tools');
const { isActionDomainAllowed } = require('~/server/services/domains');
const { encryptV2, decryptV2 } = require('~/server/utils/crypto');
const { getActions, deleteActions } = require('~/models/Action');
const { deleteAssistant } = require('~/models/Assistant');
const { logAxiosError } = require('~/utils');
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');

const toolNameRegex = /^[a-zA-Z0-9_-]+$/;
const replaceSeparatorRegex = new RegExp(actionDomainSeparator, 'g');

/**
 * Validates tool name against regex pattern and updates if necessary.
 * @param {object} params - The parameters for the function.
 * @param {object} params.req - Express Request.
 * @param {FunctionTool} params.tool - The tool object.
 * @param {string} params.assistant_id - The assistant ID
 * @returns {object|null} - Updated tool object or null if invalid and not an action.
 */
const validateAndUpdateTool = async ({ req, tool, assistant_id }) => {
  let actions;
  if (isImageVisionTool(tool)) {
    return null;
  }
  if (!toolNameRegex.test(tool.function.name)) {
    const [functionName, domain] = tool.function.name.split(actionDelimiter);
    actions = await getActions({ assistant_id, user: req.user.id }, true);
    const matchingActions = actions.filter((action) => {
      const metadata = action.metadata;
      return metadata && metadata.domain === domain;
    });
    const action = matchingActions[0];
    if (!action) {
      return null;
    }

    const parsedDomain = await domainParser(req, domain, true);

    if (!parsedDomain) {
      return null;
    }

    tool.function.name = `${functionName}${actionDelimiter}${parsedDomain}`;
  }
  return tool;
};

/**
 * Encodes or decodes a domain name to/from base64, or replacing periods with a custom separator.
 *
 * Necessary due to `[a-zA-Z0-9_-]*` Regex Validation, limited to a 64-character maximum.
 *
 * @param {Express.Request} req - The Express Request object.
 * @param {string} domain - The domain name to encode/decode.
 * @param {boolean} inverse - False to decode from base64, true to encode to base64.
 * @returns {Promise<string>} Encoded or decoded domain string.
 */
async function domainParser(req, domain, inverse = false) {
  if (!domain) {
    return;
  }

  const domainsCache = getLogStores(CacheKeys.ENCODED_DOMAINS);
  const cachedDomain = await domainsCache.get(domain);
  if (inverse && cachedDomain) {
    return domain;
  }

  if (inverse && domain.length <= Constants.ENCODED_DOMAIN_LENGTH) {
    return domain.replace(/\./g, actionDomainSeparator);
  }

  if (inverse) {
    const modifiedDomain = Buffer.from(domain).toString('base64');
    const key = modifiedDomain.substring(0, Constants.ENCODED_DOMAIN_LENGTH);
    await domainsCache.set(key, modifiedDomain);
    return key;
  }

  if (!cachedDomain) {
    return domain.replace(replaceSeparatorRegex, '.');
  }

  try {
    return Buffer.from(cachedDomain, 'base64').toString('utf-8');
  } catch (error) {
    logger.error(`Failed to parse domain (possibly not base64): ${domain}`, error);
    return domain;
  }
}

/**
 * Loads action sets based on the user and assistant ID.
 *
 * @param {Object} searchParams - The parameters for loading action sets.
 * @param {string} searchParams.user - The user identifier.
 * @param {string} [searchParams.agent_id]- The agent identifier.
 * @param {string} [searchParams.assistant_id]- The assistant identifier.
 * @returns {Promise<Action[] | null>} A promise that resolves to an array of actions or `null` if no match.
 */
async function loadActionSets(searchParams) {
  return await getActions(searchParams, true);
}

/**
 * Creates a general tool for an entire action set.
 *
 * @param {Object} params - The parameters for loading action sets.
 * @param {Action} params.action - The action set. Necessary for decrypting authentication values.
 * @param {ActionRequest} params.requestBuilder - The ActionRequest builder class to execute the API call.
 * @param {string | undefined} [params.name] - The name of the tool.
 * @param {string | undefined} [params.description] - The description for the tool.
 * @param {import('zod').ZodTypeAny | undefined} [params.zodSchema] - The Zod schema for tool input validation/definition
 * @returns { Promise<typeof tool | { _call: (toolInput: Object | string) => unknown}> } An object with `_call` method to execute the tool input.
 */
async function createActionTool({ action, requestBuilder, zodSchema, name, description }) {
  action.metadata = await decryptMetadata(action.metadata);
  const isDomainAllowed = await isActionDomainAllowed(action.metadata.domain);
  if (!isDomainAllowed) {
    return null;
  }
  /** @type {(toolInput: Object | string) => Promise<unknown>} */
  const _call = async (toolInput) => {
    try {
      const executor = requestBuilder.createExecutor();

      // Chain the operations
      const preparedExecutor = executor.setParams(toolInput);

      if (action.metadata.auth && action.metadata.auth.type !== AuthTypeEnum.None) {
        await preparedExecutor.setAuth(action.metadata);
      }

      const res = await preparedExecutor.execute();

      if (typeof res.data === 'object') {
        return JSON.stringify(res.data);
      }
      return res.data;
    } catch (error) {
      const logMessage = `API call to ${action.metadata.domain} failed`;
      logAxiosError({ message: logMessage, error });
    }
  };

  if (name) {
    return tool(_call, {
      name: name.replace(replaceSeparatorRegex, '_'),
      description: description || '',
      schema: zodSchema,
    });
  }

  return {
    _call,
  };
}

/**
 * Encrypts sensitive metadata values for an action.
 *
 * @param {ActionMetadata} metadata - The action metadata to encrypt.
 * @returns {Promise<ActionMetadata>} The updated action metadata with encrypted values.
 */
async function encryptMetadata(metadata) {
  const encryptedMetadata = { ...metadata };

  // ServiceHttp
  if (metadata.auth && metadata.auth.type === AuthTypeEnum.ServiceHttp) {
    if (metadata.api_key) {
      encryptedMetadata.api_key = await encryptV2(metadata.api_key);
    }
  }

  // OAuth
  else if (metadata.auth && metadata.auth.type === AuthTypeEnum.OAuth) {
    if (metadata.oauth_client_id) {
      encryptedMetadata.oauth_client_id = await encryptV2(metadata.oauth_client_id);
    }
    if (metadata.oauth_client_secret) {
      encryptedMetadata.oauth_client_secret = await encryptV2(metadata.oauth_client_secret);
    }
  }

  return encryptedMetadata;
}

/**
 * Decrypts sensitive metadata values for an action.
 *
 * @param {ActionMetadata} metadata - The action metadata to decrypt.
 * @returns {Promise<ActionMetadata>} The updated action metadata with decrypted values.
 */
async function decryptMetadata(metadata) {
  const decryptedMetadata = { ...metadata };

  // ServiceHttp
  if (metadata.auth && metadata.auth.type === AuthTypeEnum.ServiceHttp) {
    if (metadata.api_key) {
      decryptedMetadata.api_key = await decryptV2(metadata.api_key);
    }
  }

  // OAuth
  else if (metadata.auth && metadata.auth.type === AuthTypeEnum.OAuth) {
    if (metadata.oauth_client_id) {
      decryptedMetadata.oauth_client_id = await decryptV2(metadata.oauth_client_id);
    }
    if (metadata.oauth_client_secret) {
      decryptedMetadata.oauth_client_secret = await decryptV2(metadata.oauth_client_secret);
    }
  }

  return decryptedMetadata;
}

/**
 * Deletes an action and its corresponding assistant.
 * @param {Object} params - The parameters for the function.
 * @param {OpenAIClient} params.req - The Express Request object.
 * @param {string} params.assistant_id - The ID of the assistant.
 */
const deleteAssistantActions = async ({ req, assistant_id }) => {
  try {
    await deleteActions({ assistant_id, user: req.user.id });
    await deleteAssistant({ assistant_id, user: req.user.id });
  } catch (error) {
    const message = 'Trouble deleting Assistant Actions for Assistant ID: ' + assistant_id;
    logger.error(message, error);
    throw new Error(message);
  }
};

module.exports = {
  deleteAssistantActions,
  validateAndUpdateTool,
  createActionTool,
  encryptMetadata,
  decryptMetadata,
  loadActionSets,
  domainParser,
};
