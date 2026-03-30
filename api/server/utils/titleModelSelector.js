const { EModelEndpoint } = require('librechat-data-provider');

const TIER_COST = { nano: 0, mini: 1, standard: 2 };

/**
 * Parse a GPT model name into its components.
 * @param {string} modelName - e.g. "gpt-4o-mini", "gpt-41-nano", "gpt-4.1-mini"
 * @returns {{ version: number, variant: string, tier: 'nano'|'mini'|'standard' } | null}
 */
function parseGptModel(modelName) {
  if (!modelName || typeof modelName !== 'string') {
    return null;
  }

  // Match patterns like: gpt-4, gpt-4o, gpt-41, gpt-4.1, gpt-4o-mini, gpt-41-nano
  const match = modelName.match(/^gpt-(\d+(?:\.\d+)?)(o?)(?:-(nano|mini))?$/i);
  if (!match) {
    return null;
  }

  return {
    version: parseFloat(match[1]),
    variant: match[2] || '',
    tier: match[3] || 'standard',
  };
}

/**
 * Rank an array of model names by estimated cost (cheapest first).
 * Heuristic: tier ascending (nano < mini < standard), then version descending (newer first).
 * Non-GPT models are filtered out.
 * @param {string[]} modelNames
 * @returns {string[]} Sorted model names, cheapest first.
 */
function rankModelsByCost(modelNames) {
  const parsed = modelNames
    .map((name) => ({ name, parsed: parseGptModel(name) }))
    .filter((entry) => entry.parsed !== null);

  parsed.sort((a, b) => {
    const tierDiff = TIER_COST[a.parsed.tier] - TIER_COST[b.parsed.tier];
    if (tierDiff !== 0) {
      return tierDiff;
    }
    // Higher version first (newer = preferred within same tier)
    return b.parsed.version - a.parsed.version;
  });

  return parsed.map((entry) => entry.name);
}

/**
 * Select title model candidates from the app config for a given endpoint, ranked cheapest first.
 * @param {object} appConfig - The application config (req.config)
 * @param {string} endpoint - The endpoint identifier (e.g. EModelEndpoint.azureOpenAI)
 * @returns {string[]} Ranked model names (cheapest first), or empty array.
 */
function selectTitleModels(appConfig, endpoint) {
  if (!appConfig || !endpoint) {
    return [];
  }

  let modelNames = [];

  if (endpoint === EModelEndpoint.azureOpenAI) {
    modelNames = appConfig.endpoints?.[EModelEndpoint.azureOpenAI]?.modelNames || [];
  }

  return rankModelsByCost(modelNames);
}

module.exports = { parseGptModel, rankModelsByCost, selectTitleModels };
