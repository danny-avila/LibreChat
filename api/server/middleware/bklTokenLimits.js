const { logger } = require('@librechat/data-schemas');

let installed = false;

const SEARCH_ALIASES = [
  'bkl-search',
  'BKL Search',
  'bkl-internal',
  'HLM 3.7',
  'HLM 3.7 Pro',
  'HLM 3.5',
];

function isDisabled(value) {
  return value === '1' || String(value).toLowerCase().trim() === 'true';
}

function patchConversationDelete() {
  try {
    const conversationModule = require('~/models/Conversation');
    if (!conversationModule || typeof conversationModule.deleteConvos !== 'function') {
      return;
    }
    if (conversationModule.deleteConvos.__bklPatched) {
      return;
    }

    const originalDeleteConvos = conversationModule.deleteConvos;
    conversationModule.deleteConvos = async function bklDeleteConvos(user, filter) {
      const result = await originalDeleteConvos.call(this, user, filter);

      if (filter?.conversationId) {
        const convoId = filter.conversationId;
        const apiUrl = process.env.BKL_API_BASE_URL || 'http://ai-api:8000';
        const doFetch = global.fetch || require('node-fetch');

        doFetch(`${apiUrl}/api/bkl/memory/${encodeURIComponent(convoId)}`, {
          method: 'DELETE',
        }).catch((err) => {
          logger.warn('[BKL ChatMemory] Failed to delete conversation vectors', err);
        });
      }

      return result;
    };
    conversationModule.deleteConvos.__bklPatched = true;
    logger.info('[BKL ChatMemory] deleteConvos cleanup patch installed');
  } catch (err) {
    logger.warn('[BKL ChatMemory] Failed to install deleteConvos cleanup patch', err);
  }
}

function patchTokenLimits() {
  try {
    const api = require('@librechat/api');
    const maxContext = Number(process.env.BKL_SEARCH_MAX_CONTEXT) || 200000;
    const maxOutput = Number(process.env.BKL_SEARCH_MAX_OUTPUT) || 8192;

    if (api.maxTokensMap && typeof api.maxTokensMap === 'object') {
      for (const endpoint of Object.keys(api.maxTokensMap)) {
        const entry = api.maxTokensMap[endpoint];
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        for (const alias of SEARCH_ALIASES) {
          entry[alias] = entry[alias] || maxContext;
        }
      }
      logger.info(`[bkl-token-limits] context aliases registered at ${maxContext}`);
    }

    if (api.maxOutputTokensMap && typeof api.maxOutputTokensMap === 'object') {
      for (const endpoint of Object.keys(api.maxOutputTokensMap)) {
        const entry = api.maxOutputTokensMap[endpoint];
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        for (const alias of SEARCH_ALIASES) {
          entry[alias] = entry[alias] || maxOutput;
        }
      }
      logger.info(`[bkl-token-limits] output aliases registered at ${maxOutput}`);
    }
  } catch (err) {
    logger.warn('[bkl-token-limits] Failed to register BKL token limits', err);
  }
}

function installBklTokenLimits() {
  if (installed || isDisabled(process.env.BKL_TOKEN_LIMITS_PATCH_DISABLE)) {
    return;
  }
  installed = true;
  patchConversationDelete();
  patchTokenLimits();
}

module.exports = {
  installBklTokenLimits,
  SEARCH_ALIASES,
};
