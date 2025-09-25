/**
 * OpenRouter Provider Privacy Mapping
 * Based on provider documentation and policies as of 2025
 *
 * This mapping indicates which providers may train on user data
 * according to their standard policies. Users can override this
 * with account-level settings or per-request ZDR parameters.
 */

export interface ModelPrivacyInfo {
  provider: string;
  mayTrainOnData: boolean;
  hasZDR?: boolean; // Zero Data Retention available
}

// Providers known to NOT train on user data by default
const NO_TRAINING_PROVIDERS = [
  'anthropic',      // Claude models - no training on user data
  'mistral',        // Mistral AI - no training policy
  'deepseek',       // DeepSeek - no training on user data
  'perplexity',     // Perplexity - search focused, no training
  'inflection',     // Inflection AI - no training
  'cohere',         // Cohere (with specific agreements)
];

// Providers that MAY train on user data (unless ZDR is enabled)
const MAY_TRAIN_PROVIDERS = [
  'openai',         // OpenAI - may use for training unless opted out
  'google',         // Google - may use for model improvement
  'meta',           // Meta Llama - open models, usage varies
  'microsoft',      // Microsoft/Azure - depends on configuration
  'ai21',           // AI21 Labs - may use for improvements
  'huggingface',    // HuggingFace - varies by model
];

// Special cases
const SPECIAL_CASES: Record<string, boolean> = {
  'openrouter/auto': false,  // Auto Router doesn't train, just routes
  'openai/gpt-4o': false,    // Enterprise models with special agreements
  'openai/gpt-4-turbo': false,
};

/**
 * Extract provider name from model ID
 * @param modelId - Full model ID like "anthropic/claude-3-opus"
 * @returns Provider name
 */
export function extractProvider(modelId: string): string {
  if (!modelId) return 'unknown';

  // Handle special cases first
  if (modelId === 'openrouter/auto') return 'openrouter';

  // Extract provider from ID format: "provider/model-name"
  const parts = modelId.split('/');
  if (parts.length >= 2) {
    return parts[0].toLowerCase();
  }

  // Fallback to the full ID as provider
  return modelId.toLowerCase();
}

/**
 * Determine if a model may train on user data
 * @param modelId - Full model ID
 * @returns true if the model may train on data, false if it doesn't
 */
export function mayTrainOnUserData(modelId: string): boolean {
  // Check special cases first
  if (modelId in SPECIAL_CASES) {
    return SPECIAL_CASES[modelId];
  }

  const provider = extractProvider(modelId);

  // Check if provider is in no-training list
  if (NO_TRAINING_PROVIDERS.includes(provider)) {
    return false;
  }

  // Check if provider may train
  if (MAY_TRAIN_PROVIDERS.includes(provider)) {
    return true;
  }

  // Conservative default: assume may train if unknown
  return true;
}

/**
 * Get privacy information for a model
 * @param modelId - Full model ID
 * @returns Privacy information object
 */
export function getModelPrivacyInfo(modelId: string): ModelPrivacyInfo {
  const provider = extractProvider(modelId);
  const mayTrain = mayTrainOnUserData(modelId);

  // Most providers support ZDR through OpenRouter
  const hasZDR = !['huggingface', 'replicate'].includes(provider);

  return {
    provider,
    mayTrainOnData: mayTrain,
    hasZDR,
  };
}

/**
 * Get human-readable provider name
 * @param provider - Provider identifier
 * @returns Formatted provider name
 */
export function getProviderDisplayName(provider: string): string {
  const displayNames: Record<string, string> = {
    'anthropic': 'Anthropic',
    'openai': 'OpenAI',
    'google': 'Google',
    'meta': 'Meta',
    'microsoft': 'Microsoft',
    'mistral': 'Mistral AI',
    'deepseek': 'DeepSeek',
    'perplexity': 'Perplexity',
    'cohere': 'Cohere',
    'ai21': 'AI21 Labs',
    'inflection': 'Inflection',
    'huggingface': 'HuggingFace',
    'openrouter': 'OpenRouter',
    'replicate': 'Replicate',
    'together': 'Together AI',
    'anyscale': 'Anyscale',
    'fireworks': 'Fireworks',
  };

  return displayNames[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Sort models by provider and name
 * @param models - Array of model objects with id field
 * @param sortKey - 'provider' or 'name'
 * @param sortDir - 'asc' or 'desc'
 * @returns Sorted array
 */
export function sortModels<T extends { id: string; name?: string }>(
  models: T[],
  sortKey: 'provider' | 'name' = 'provider',
  sortDir: 'asc' | 'desc' = 'asc',
): T[] {
  return [...models].sort((a, b) => {
    let aKey: string;
    let bKey: string;

    if (sortKey === 'provider') {
      aKey = getProviderDisplayName(extractProvider(a.id));
      bKey = getProviderDisplayName(extractProvider(b.id));
    } else {
      // Sort by name or fall back to ID
      aKey = a.name || a.id;
      bKey = b.name || b.id;
    }

    const comparison = aKey.localeCompare(bKey, undefined, { sensitivity: 'base' });
    return sortDir === 'asc' ? comparison : -comparison;
  });
}

/**
 * Filter models based on privacy preferences
 * @param models - Array of models
 * @param excludeTraining - If true, exclude models that may train on data
 * @returns Filtered array
 */
export function filterModelsByPrivacy<T extends { id: string }>(
  models: T[],
  excludeTraining: boolean,
): T[] {
  if (!excludeTraining) return models;

  return models.filter(model => {
    // Never filter out Auto Router
    if (model.id === 'openrouter/auto') return true;

    return !mayTrainOnUserData(model.id);
  });
}