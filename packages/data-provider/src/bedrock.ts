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

export const bedrockOutputParser = (data: Record<string, unknown>) => {
  const knownKeys = [...Object.keys(s.tConversationSchema.shape), 'topK', 'top_k'];
  const result: Record<string, unknown> = {};

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

  // Remove additionalModelRequestFields from the result
  delete result.additionalModelRequestFields;

  return result;
};
