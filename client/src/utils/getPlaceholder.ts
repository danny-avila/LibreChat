// Static model costs table
import type { LocalizeFunction } from '~/common';

const MODEL_COSTS: Record<string, number> = {
  'Llama 4 Maverick': 3,
  'Llama 4 Scout': 2,
  'Llama 3.3 Turbo': 1,
  'Llama 3.2 Turbo': 1,
  'Claude 3.7 Sonnet': 20,
  'Claude 3.5 Haiku': 5,
  'Qwen 3': 10,
  QwQ: 2,
  'Qwen 2.5': 5,
  'Gemini 2.0 Flash': 3,
  'Gemini 2.0 Flash Lite': 2,
  'Gemini 2.5 Pro': 100,
  'Gemini 2.5 Flash Preview': 12,
  'Omnexio Search': 1,
  'deepseek-chat': 2,
  'deepseek-coder': 5,
  'deepseek-reasoner': 5,
  o1: 100,
  'o1-mini': 20,
  'gpt-4o': 30,
  'gpt-4o-mini': 5,
  'gpt-4.1': 30,
  'gpt-4.1-nano': 1,
  'gpt-4.1-mini': 5,
  'o3-mini': 20,
  o3: 80,
  'o4-mini': 20,
  'Claude 4 Opus': 100,
  'Claude 4 Sonnet': 20,
};

/**
 * Function to get placeholder text based on model cost
 * @param model - The model name from conversation.model
 * @param localize - The localization function
 * @returns Placeholder text with cost information or fallback
 */
export const getPlaceholder = (
  model: string | null | undefined,
  localize: LocalizeFunction,
): string => {
  if (!model) {
    return localize('com_endpoint_ai');
  }

  const cost = MODEL_COSTS[model];
  if (cost !== undefined) {
    return `[${model}] costs ${cost} ${cost === 1 ? 'credit' : 'credits'}`;
  }

  // Fallback to generic AI if model not found in costs table
  return localize('com_endpoint_ai');
};

export default getPlaceholder;
