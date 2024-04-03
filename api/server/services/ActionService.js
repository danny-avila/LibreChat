const { AuthTypeEnum, EModelEndpoint, actionDomainSeparator } = require('librechat-data-provider');
const { encryptV2, decryptV2 } = require('~/server/utils/crypto');
const { getActions } = require('~/models/Action');
const { logger } = require('~/config');

/**
 * Parses the domain for an action.
 *
 * Azure OpenAI Assistants API doesn't support periods in function
 * names due to `[a-zA-Z0-9_-]*` Regex Validation.
 *
 * @param {Express.Request} req - Express Request object
 * @param {string} domain - The domain for the actoin
 * @param {boolean} inverse - If true, replaces periods with `actionDomainSeparator`
 * @returns {string} The parsed domain
 */
function domainParser(req, domain, inverse = false) {
  if (!domain) {
    return;
  }

  if (!req.app.locals[EModelEndpoint.azureOpenAI]?.assistants) {
    return domain;
  }

  if (inverse) {
    return domain.replace(/\./g, actionDomainSeparator);
  }

  return domain.replace(actionDomainSeparator, '.');
}

/**
 * Loads action sets based on the user and assistant ID.
 *
 * @param {Object} searchParams - The parameters for loading action sets.
 * @param {string} searchParams.user - The user identifier.
 * @param {string} searchParams.assistant_id - The assistant identifier.
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
 * @returns { { _call: (toolInput: Object) => unknown} } An object with `_call` method to execute the tool input.
 */
function createActionTool({ action, requestBuilder }) {
  action.metadata = decryptMetadata(action.metadata);
  const _call = async (toolInput) => {
    try {
      requestBuilder.setParams(toolInput);
      if (action.metadata.auth && action.metadata.auth.type !== AuthTypeEnum.None) {
        await requestBuilder.setAuth(action.metadata);
      }
      const res = await requestBuilder.execute();
      if (typeof res.data === 'object') {
        return JSON.stringify(res.data);
      }
      return res.data;
    } catch (error) {
      logger.error(`API call to ${action.metadata.domain} failed`, error);
      if (error.response) {
        const { status, data } = error.response;
        return `API call to ${
          action.metadata.domain
        } failed with status ${status}: ${JSON.stringify(data)}`;
      }

      return `API call to ${action.metadata.domain} failed.`;
    }
  };

  return {
    _call,
  };
}

/**
 * Encrypts sensitive metadata values for an action.
 *
 * @param {ActionMetadata} metadata - The action metadata to encrypt.
 * @returns {ActionMetadata} The updated action metadata with encrypted values.
 */
function encryptMetadata(metadata) {
  const encryptedMetadata = { ...metadata };

  // ServiceHttp
  if (metadata.auth && metadata.auth.type === AuthTypeEnum.ServiceHttp) {
    if (metadata.api_key) {
      encryptedMetadata.api_key = encryptV2(metadata.api_key);
    }
  }

  // OAuth
  else if (metadata.auth && metadata.auth.type === AuthTypeEnum.OAuth) {
    if (metadata.oauth_client_id) {
      encryptedMetadata.oauth_client_id = encryptV2(metadata.oauth_client_id);
    }
    if (metadata.oauth_client_secret) {
      encryptedMetadata.oauth_client_secret = encryptV2(metadata.oauth_client_secret);
    }
  }

  return encryptedMetadata;
}

/**
 * Decrypts sensitive metadata values for an action.
 *
 * @param {ActionMetadata} metadata - The action metadata to decrypt.
 * @returns {ActionMetadata} The updated action metadata with decrypted values.
 */
function decryptMetadata(metadata) {
  const decryptedMetadata = { ...metadata };

  // ServiceHttp
  if (metadata.auth && metadata.auth.type === AuthTypeEnum.ServiceHttp) {
    if (metadata.api_key) {
      decryptedMetadata.api_key = decryptV2(metadata.api_key);
    }
  }

  // OAuth
  else if (metadata.auth && metadata.auth.type === AuthTypeEnum.OAuth) {
    if (metadata.oauth_client_id) {
      decryptedMetadata.oauth_client_id = decryptV2(metadata.oauth_client_id);
    }
    if (metadata.oauth_client_secret) {
      decryptedMetadata.oauth_client_secret = decryptV2(metadata.oauth_client_secret);
    }
  }

  return decryptedMetadata;
}

module.exports = {
  loadActionSets,
  createActionTool,
  encryptMetadata,
  decryptMetadata,
  domainParser,
};
