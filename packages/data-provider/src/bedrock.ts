import { z } from 'zod';
import * as s from './schemas';

export const bedrockInputSchema = s.tConversationSchema
  .pick({
    /* LibreChat params; optionType: 'conversation' */
    modelLabel: true,
    promptPrefix: true,
    resendFiles: true,
    iconURL: true,
    greeting: true,
    spec: true,
    maxOutputTokens: true,
    maxContextTokens: true,
    artifacts: true,
    /* Bedrock params; optionType: 'model' */
    region: true,
    system: true,
    model: true,
    maxTokens: true,
    temperature: true,
    topP: true,
    stop: true,
    thinking: true,
    thinkingBudget: true,
    /* Catch-all fields */
    topK: true,
    additionalModelRequestFields: true,
  })
  .transform((obj) => s.removeNullishValues(obj))
  .catch(() => ({}));

export type BedrockConverseInput = z.infer<typeof bedrockInputSchema>;

export const bedrockInputParser = s.tConversationSchema
  .pick({
    /* LibreChat params; optionType: 'conversation' */
    modelLabel: true,
    promptPrefix: true,
    resendFiles: true,
    iconURL: true,
    greeting: true,
    spec: true,
    artifacts: true,
    maxOutputTokens: true,
    maxContextTokens: true,
    /* Bedrock params; optionType: 'model' */
    region: true,
    model: true,
    maxTokens: true,
    temperature: true,
    topP: true,
    stop: true,
    thinking: true,
    thinkingBudget: true,
    /* Catch-all fields */
    topK: true,
    additionalModelRequestFields: true,
  })
  .catchall(z.any())
  .transform((data) => {
    const knownKeys = [
      'modelLabel',
      'promptPrefix',
      'resendFiles',
      'iconURL',
      'greeting',
      'spec',
      'maxOutputTokens',
      'artifacts',
      'additionalModelRequestFields',
      'region',
      'model',
      'maxTokens',
      'temperature',
      'topP',
      'stop',
    ];

    const additionalFields: Record<string, unknown> = {};
    const typedData = data as Record<string, unknown>;

    Object.entries(typedData).forEach(([key, value]) => {
      if (!knownKeys.includes(key)) {
        if (key === 'topK') {
          additionalFields['top_k'] = value;
        } else {
          additionalFields[key] = value;
        }
        delete typedData[key];
      }
    });

    /** Default thinking and thinkingBudget for 'anthropic.claude-3-7-sonnet' models, if not defined */
    if (
      typeof typedData.model === 'string' &&
      typedData.model.includes('anthropic.claude-3-7-sonnet')
    ) {
      if (additionalFields.thinking === undefined) {
        additionalFields.thinking = true;
      }

      if (additionalFields.thinkingBudget === undefined) {
        additionalFields.thinkingBudget = 2000;
      }
    } else if (additionalFields.thinking != null || additionalFields.thinkingBudget != null) {
      delete additionalFields.thinking;
      delete additionalFields.thinkingBudget;
    }

    if (Object.keys(additionalFields).length > 0) {
      typedData.additionalModelRequestFields = {
        ...((typedData.additionalModelRequestFields as Record<string, unknown> | undefined) || {}),
        ...additionalFields,
      };
    }

    if (typedData.maxOutputTokens !== undefined) {
      typedData.maxTokens = typedData.maxOutputTokens;
    } else if (typedData.maxTokens !== undefined) {
      typedData.maxOutputTokens = typedData.maxTokens;
    }

    return s.removeNullishValues(typedData) as BedrockConverseInput;
  })
  .catch(() => ({}));

type ThinkingConfig = {
  thinking?:
    | {
        type: 'enabled';
        budget_tokens: number;
      }
    | boolean;
  thinkingBudget?: number;
};

type AnthropicInput = BedrockConverseInput & {
  additionalModelRequestFields: BedrockConverseInput['additionalModelRequestFields'] &
    ThinkingConfig;
};

/**
 * Configures the "thinking" parameter based on given input and thinking options.
 *
 * @param data - The parsed Bedrock request options object
 * @returns The object with thinking configured appropriately
 */
function configureThinking(data: AnthropicInput): AnthropicInput {
  const updatedData = { ...data };
  updatedData.maxTokens = updatedData.maxTokens ?? updatedData.maxOutputTokens ?? 8192;

  if (updatedData.additionalModelRequestFields?.thinking === true) {
    const thinkingConfig: ThinkingConfig['thinking'] = {
      type: 'enabled',
      budget_tokens: updatedData.thinkingBudget ?? 2000,
    };

    if (thinkingConfig.budget_tokens > updatedData.maxTokens) {
      thinkingConfig.budget_tokens = Math.floor(updatedData.maxTokens * 0.9);
    }
    updatedData.additionalModelRequestFields.thinking = thinkingConfig;
  }
  return updatedData;
}

export const bedrockOutputParser = (data: Record<string, unknown>) => {
  const knownKeys = [...Object.keys(s.tConversationSchema.shape), 'topK', 'top_k'];
  let result: Record<string, unknown> = {};

  // Extract known fields from the root level
  Object.entries(data).forEach(([key, value]) => {
    if (knownKeys.includes(key)) {
      result[key] = value;
    }
  });

  // Extract known fields from additionalModelRequestFields
  if (
    typeof data.additionalModelRequestFields === 'object' &&
    data.additionalModelRequestFields !== null
  ) {
    Object.entries(data.additionalModelRequestFields as Record<string, unknown>).forEach(
      ([key, value]) => {
        if (knownKeys.includes(key)) {
          if (key === 'top_k') {
            result['topK'] = value;
          } else if (key === 'thinking' || key === 'thinkingBudget') {
            return;
          } else {
            result[key] = value;
          }
        }
      },
    );
  }

  result = configureThinking(result as AnthropicInput);

  // Handle maxTokens and maxOutputTokens
  if (result.maxTokens !== undefined && result.maxOutputTokens === undefined) {
    result.maxOutputTokens = result.maxTokens;
  } else if (result.maxOutputTokens !== undefined && result.maxTokens === undefined) {
    result.maxTokens = result.maxOutputTokens;
  }

  // Remove additionalModelRequestFields from the result if it doesn't thinking config
  if ((result as AnthropicInput).additionalModelRequestFields?.thinking == null) {
    delete result.additionalModelRequestFields;
  }

  return result;
};
