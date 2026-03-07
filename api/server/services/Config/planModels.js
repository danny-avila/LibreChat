/**
 * Plan-to-models mapping for Bizu.
 *
 * Each plan lists the OpenRouter model IDs that users on that plan can access.
 * Higher plans inherit all models from lower plans.
 */
const planModels = {
  free: [
    'deepseek/deepseek-chat-v3-0324',
  ],
  basic_cn: [
    'deepseek/deepseek-chat-v3-0324',
    'deepseek/deepseek-r1',
    'deepseek/deepseek-r1-0528',
    'qwen/qwen3-235b-a22b',
    'qwen/qwen3-30b-a3b',
  ],
  pro_global: ['*'], // all models
};

/**
 * Check if a user's plan allows access to a specific model.
 * @param {string} plan - The user's plan ('free', 'basic_cn', 'pro_global')
 * @param {string} model - The OpenRouter model ID
 * @returns {boolean}
 */
function isModelAllowedForPlan(plan, model) {
  const allowed = planModels[plan] || planModels.free;
  if (allowed.includes('*')) {
    return true;
  }
  return allowed.includes(model);
}

/**
 * Get the list of allowed model IDs for a plan.
 * @param {string} plan
 * @returns {string[]}
 */
function getAllowedModelsForPlan(plan) {
  return planModels[plan] || planModels.free;
}

module.exports = {
  planModels,
  isModelAllowedForPlan,
  getAllowedModelsForPlan,
};
