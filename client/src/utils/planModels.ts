/**
 * Plan-to-models mapping for Bizu (client-side mirror of server config).
 */
const planModels: Record<string, string[]> = {
  free: ['deepseek/deepseek-chat-v3-0324'],
  basic_cn: [
    'deepseek/deepseek-chat-v3-0324',
    'deepseek/deepseek-r1',
    'deepseek/deepseek-r1-0528',
    'qwen/qwen3-235b-a22b',
    'qwen/qwen3-30b-a3b',
  ],
  pro_global: ['*'],
};

export function isModelAllowedForPlan(plan: string | undefined, model: string): boolean {
  const allowed = planModels[plan ?? 'free'] ?? planModels.free;
  if (allowed.includes('*')) {
    return true;
  }
  return allowed.includes(model);
}
