import { z } from 'zod';
import * as s from './schemas';

const DEFAULT_ENABLED_MAX_TOKENS = 8192;
const DEFAULT_ADAPTIVE_MAX_TOKENS = 16000;
const DEFAULT_THINKING_BUDGET = 2000;

type ThinkingConfig = { type: 'enabled'; budget_tokens: number } | { type: 'adaptive' };

type AnthropicReasoning = {
  thinking?: ThinkingConfig | boolean;
  thinkingBudget?: number;
};

type AnthropicInput = BedrockConverseInput & {
  additionalModelRequestFields: BedrockConverseInput['additionalModelRequestFields'] &
    AnthropicReasoning;
};

/** Extracts opus major/minor version from both naming formats */
function parseOpusVersion(model: string): { major: number; minor: number } | null {
  const nameFirst = model.match(/claude-opus[-.]?(\d+)(?:[-.](\d+))?/);
  if (nameFirst) {
    return {
      major: parseInt(nameFirst[1], 10),
      minor: nameFirst[2] != null ? parseInt(nameFirst[2], 10) : 0,
    };
  }
  const numFirst = model.match(/claude-(\d+)(?:[-.](\d+))?-opus/);
  if (numFirst) {
    return {
      major: parseInt(numFirst[1], 10),
      minor: numFirst[2] != null ? parseInt(numFirst[2], 10) : 0,
    };
  }
  return null;
}

/** Extracts sonnet major version from both naming formats */
function parseSonnetVersion(model: string): number | null {
  const nameFirst = model.match(/claude-sonnet[-.]?(\d+)/);
  if (nameFirst) {
    return parseInt(nameFirst[1], 10);
  }
  const numFirst = model.match(/claude-(\d+)(?:[-.]?\d+)?-sonnet/);
  if (numFirst) {
    return parseInt(numFirst[1], 10);
  }
  return null;
}

/** Checks if a model supports adaptive thinking (Opus 4.6+, Sonnet 5+) */
export function supportsAdaptiveThinking(model: string): boolean {
  const opus = parseOpusVersion(model);
  if (opus && (opus.major > 4 || (opus.major === 4 && opus.minor >= 6))) {
    return true;
  }
  const sonnet = parseSonnetVersion(model);
  if (sonnet != null && sonnet >= 5) {
    return true;
  }
  return false;
}

/** Checks if a model qualifies for the context-1m beta header (Sonnet 4+, Opus 4.6+, Opus 5+) */
export function supportsContext1m(model: string): boolean {
  const sonnet = parseSonnetVersion(model);
  if (sonnet != null && sonnet >= 4) {
    return true;
  }
  const opus = parseOpusVersion(model);
  if (opus && (opus.major > 4 || (opus.major === 4 && opus.minor >= 6))) {
    return true;
  }
  return false;
}

/**
 * Gets the appropriate anthropic_beta headers for Bedrock Anthropic models.
 * Bedrock uses `anthropic_beta` (with underscore) in additionalModelRequestFields.
 *
 * @param model - The Bedrock model identifier (e.g., "anthropic.claude-sonnet-4-20250514-v1:0")
 * @returns Array of beta header strings, or empty array if not applicable
 */
function getBedrockAnthropicBetaHeaders(model: string): string[] {
  const betaHeaders: string[] = [];

  const isClaudeThinkingModel =
    model.includes('anthropic.claude-3-7-sonnet') ||
    /anthropic\.claude-(?:[4-9](?:\.\d+)?(?:-\d+)?-(?:sonnet|opus|haiku)|(?:sonnet|opus|haiku)-[4-9])/.test(
      model,
    );

  const isSonnet4PlusModel =
    /anthropic\.claude-(?:sonnet-[4-9]|[4-9](?:\.\d+)?(?:-\d+)?-sonnet)/.test(model);

  if (isClaudeThinkingModel) {
    betaHeaders.push('output-128k-2025-02-19');
  }

  if (isSonnet4PlusModel || supportsAdaptiveThinking(model)) {
    betaHeaders.push('context-1m-2025-08-07');
  }

  return betaHeaders;
}

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
    effort: true,
    promptCache: true,
    /* Catch-all fields */
    topK: true,
    additionalModelRequestFields: true,
  })
  .transform((obj) => {
    if ((obj as AnthropicInput).additionalModelRequestFields?.thinking != null) {
      const _obj = obj as AnthropicInput;
      const thinking = _obj.additionalModelRequestFields.thinking;
      obj.thinking = !!thinking;
      obj.thinkingBudget =
        typeof thinking === 'object' && 'budget_tokens' in thinking
          ? thinking.budget_tokens
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
    effort: true,
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
      const isAdaptive = supportsAdaptiveThinking(typedData.model as string);

      if (isAdaptive) {
        const effort = additionalFields.effort;
        if (effort && typeof effort === 'string' && effort !== '') {
          additionalFields.output_config = { effort };
        }
        delete additionalFields.effort;

        if (additionalFields.thinking === false) {
          delete additionalFields.thinking;
          delete additionalFields.thinkingBudget;
        } else {
          additionalFields.thinking = { type: 'adaptive' };
          delete additionalFields.thinkingBudget;
        }
      } else {
        if (additionalFields.thinking === undefined) {
          additionalFields.thinking = true;
        } else if (additionalFields.thinking === false) {
          delete additionalFields.thinking;
          delete additionalFields.thinkingBudget;
        }

        if (additionalFields.thinking === true && additionalFields.thinkingBudget === undefined) {
          additionalFields.thinkingBudget = DEFAULT_THINKING_BUDGET;
        }
        delete additionalFields.effort;
      }

      if ((typedData.model as string).includes('anthropic.')) {
        const betaHeaders = getBedrockAnthropicBetaHeaders(typedData.model as string);
        if (betaHeaders.length > 0) {
          additionalFields.anthropic_beta = betaHeaders;
        }
      }
    } else {
      delete additionalFields.thinking;
      delete additionalFields.thinkingBudget;
      delete additionalFields.effort;
      delete additionalFields.output_config;
      delete additionalFields.anthropic_beta;
    }

    const isAnthropicModel =
      typeof typedData.model === 'string' && typedData.model.includes('anthropic.');

    /** Strip stale anthropic_beta from previously-persisted additionalModelRequestFields */
    if (
      !isAnthropicModel &&
      typeof typedData.additionalModelRequestFields === 'object' &&
      typedData.additionalModelRequestFields != null
    ) {
      const amrf = typedData.additionalModelRequestFields as Record<string, unknown>;
      delete amrf.anthropic_beta;
      delete amrf.thinking;
      delete amrf.thinkingBudget;
      delete amrf.effort;
      delete amrf.output_config;
    }

    /** Default promptCache for claude and nova models, if not defined */
    if (
      typeof typedData.model === 'string' &&
      (typedData.model.includes('claude') || typedData.model.includes('nova'))
    ) {
      if (typedData.promptCache === undefined) {
        typedData.promptCache = true;
      }
    } else if (typedData.promptCache === true) {
      typedData.promptCache = undefined;
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
  const thinking = updatedData.additionalModelRequestFields?.thinking;

  if (thinking === true) {
    updatedData.maxTokens =
      updatedData.maxTokens ?? updatedData.maxOutputTokens ?? DEFAULT_ENABLED_MAX_TOKENS;
    delete updatedData.maxOutputTokens;
    const thinkingConfig: ThinkingConfig = {
      type: 'enabled',
      budget_tokens:
        updatedData.additionalModelRequestFields?.thinkingBudget ?? DEFAULT_THINKING_BUDGET,
    };

    if (thinkingConfig.budget_tokens > updatedData.maxTokens) {
      thinkingConfig.budget_tokens = Math.floor(updatedData.maxTokens * 0.9);
    }
    updatedData.additionalModelRequestFields!.thinking = thinkingConfig;
    delete updatedData.additionalModelRequestFields!.thinkingBudget;
  } else if (
    typeof thinking === 'object' &&
    thinking != null &&
    (thinking as { type: string }).type === 'adaptive'
  ) {
    updatedData.maxTokens =
      updatedData.maxTokens ?? updatedData.maxOutputTokens ?? DEFAULT_ADAPTIVE_MAX_TOKENS;
    delete updatedData.maxOutputTokens;
    delete updatedData.additionalModelRequestFields!.thinkingBudget;
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
  const amrf = result.additionalModelRequestFields as Record<string, unknown> | undefined;
  if (!amrf || Object.keys(amrf).length === 0) {
    delete result.additionalModelRequestFields;
  }

  return result;
};
