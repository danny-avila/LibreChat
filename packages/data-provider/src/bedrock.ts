import { z } from 'zod';
import * as s from './schemas';

type ThinkingConfig = {
  type: 'enabled';
  budget_tokens: number;
};
type AnthropicReasoning = {
  thinking?: ThinkingConfig | boolean;
  thinkingBudget?: number;
};

type AnthropicInput = BedrockConverseInput & {
  additionalModelRequestFields: BedrockConverseInput['additionalModelRequestFields'] &
    AnthropicReasoning;
};

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
    promptCache: true,
    /* Catch-all fields */
    topK: true,
    additionalModelRequestFields: true,
  })
  .transform((obj) => {
    if ((obj as AnthropicInput).additionalModelRequestFields?.thinking != null) {
      const _obj = obj as AnthropicInput;
      obj.thinking = !!_obj.additionalModelRequestFields.thinking;
      obj.thinkingBudget =
        typeof _obj.additionalModelRequestFields.thinking === 'object'
          ? (_obj.additionalModelRequestFields.thinking as ThinkingConfig)?.budget_tokens
          : undefined;
      delete obj.additionalModelRequestFields;
    }
    return s.removeNullishValues(obj);
  })
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
    promptCache: true,
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
      'promptCache',
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
      (typedData.model.includes('anthropic.claude-3-7-sonnet') ||
        /anthropic\.claude-(?:[4-9](?:\.\d+)?(?:-\d+)?-(?:sonnet|opus|haiku)|(?:sonnet|opus|haiku)-[4-9])/.test(
          typedData.model,
        ))
    ) {
      if (additionalFields.thinking === undefined) {
        additionalFields.thinking = true;
      } else if (additionalFields.thinking === false) {
        delete additionalFields.thinking;
        delete additionalFields.thinkingBudget;
      }

      if (additionalFields.thinking === true && additionalFields.thinkingBudget === undefined) {
        additionalFields.thinkingBudget = 2000;
      }
      additionalFields.anthropic_beta = ['output-128k-2025-02-19'];
    } else if (additionalFields.thinking != null || additionalFields.thinkingBudget != null) {
      delete additionalFields.thinking;
      delete additionalFields.thinkingBudget;
    }

    /** Default promptCache for claude and nova models, if not defined */
    if (
      typeof typedData.model === 'string' &&
      (typedData.model.includes('claude') || typedData.model.includes('nova')) &&
      typedData.promptCache === undefined
    ) {
      typedData.promptCache = true;
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

/**
 * Configures the "thinking" parameter based on given input and thinking options.
 *
 * @param data - The parsed Bedrock request options object
 * @returns The object with thinking configured appropriately
 */
function configureThinking(data: AnthropicInput): AnthropicInput {
  const updatedData = { ...data };
  if (updatedData.additionalModelRequestFields?.thinking === true) {
    updatedData.maxTokens = updatedData.maxTokens ?? updatedData.maxOutputTokens ?? 8192;
    delete updatedData.maxOutputTokens;
    const thinkingConfig: AnthropicReasoning['thinking'] = {
      type: 'enabled',
      budget_tokens: updatedData.additionalModelRequestFields.thinkingBudget ?? 2000,
    };

    if (thinkingConfig.budget_tokens > updatedData.maxTokens) {
      thinkingConfig.budget_tokens = Math.floor(updatedData.maxTokens * 0.9);
    }
    updatedData.additionalModelRequestFields.thinking = thinkingConfig;
    delete updatedData.additionalModelRequestFields.thinkingBudget;
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

  // Handle maxTokens and maxOutputTokens
  if (result.maxTokens !== undefined && result.maxOutputTokens === undefined) {
    result.maxOutputTokens = result.maxTokens;
  } else if (result.maxOutputTokens !== undefined && result.maxTokens === undefined) {
    result.maxTokens = result.maxOutputTokens;
  }

  result = configureThinking(result as AnthropicInput);
  // Remove additionalModelRequestFields from the result if it doesn't thinking config
  if ((result as AnthropicInput).additionalModelRequestFields?.thinking == null) {
    delete result.additionalModelRequestFields;
  }

  return result;
};
