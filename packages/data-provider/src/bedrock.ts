import { z } from 'zod';
import * as s from './schemas';

const DEFAULT_ENABLED_MAX_TOKENS = 8192;
const DEFAULT_THINKING_BUDGET = 2000;

const bedrockReasoningConfigValues = new Set<string>(Object.values(s.BedrockReasoningConfig));

type ThinkingConfig =
  | { type: 'enabled'; budget_tokens: number }
  | { type: 'adaptive'; display?: s.ThinkingDisplayWireValue };

/**
 * Resolves the final `thinking.display` value for an adaptive-thinking request.
 *
 * Starting with Claude Opus 4.7, the Messages API returns empty `thinking`
 * blocks unless the request sets `thinking.display`. This helper encodes the
 * three user-facing modes — `'auto'` (LibreChat decides), `'summarized'`, and
 * `'omitted'` — into the wire value (or `undefined` when the field should be
 * left off).
 *
 * See https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7#thinking-content-omitted-by-default
 */
/**
 * Safely extracts a nested `thinking.display` string from a persisted
 * `additionalModelRequestFields` object, returning `undefined` if the shape
 * isn't what we expect.
 */
function extractPersistedDisplay(amrf: unknown): string | undefined {
  if (typeof amrf !== 'object' || amrf === null) {
    return undefined;
  }
  const thinking = (amrf as Record<string, unknown>).thinking;
  if (typeof thinking !== 'object' || thinking === null) {
    return undefined;
  }
  const display = (thinking as Record<string, unknown>).display;
  return typeof display === 'string' ? display : undefined;
}

export function resolveThinkingDisplay(
  model: string,
  explicit?: s.ThinkingDisplay | string | null,
): s.ThinkingDisplayWireValue | undefined {
  if (explicit === s.ThinkingDisplay.summarized) {
    return s.ThinkingDisplay.summarized;
  }
  if (explicit === s.ThinkingDisplay.omitted) {
    return s.ThinkingDisplay.omitted;
  }
  if (omitsThinkingByDefault(model)) {
    return s.ThinkingDisplay.summarized;
  }
  return undefined;
}

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

/** Extracts sonnet major/minor version from both naming formats.
 *  Uses single-digit minor capture to avoid matching date suffixes (e.g., -20250514). */
function parseSonnetVersion(model: string): { major: number; minor: number } | null {
  const nameFirst = model.match(/claude-sonnet[-.]?(\d+)(?:[-.](\d)(?!\d))?/);
  if (nameFirst) {
    return {
      major: parseInt(nameFirst[1], 10),
      minor: nameFirst[2] != null ? parseInt(nameFirst[2], 10) : 0,
    };
  }
  const numFirst = model.match(/claude-(\d+)(?:[-.](\d)(?!\d))?-sonnet/);
  if (numFirst) {
    return {
      major: parseInt(numFirst[1], 10),
      minor: numFirst[2] != null ? parseInt(numFirst[2], 10) : 0,
    };
  }
  return null;
}

/** Checks if a model supports adaptive thinking (Opus 4.6+, Sonnet 4.6+) */
export function supportsAdaptiveThinking(model: string): boolean {
  const opus = parseOpusVersion(model);
  if (opus && (opus.major > 4 || (opus.major === 4 && opus.minor >= 6))) {
    return true;
  }
  const sonnet = parseSonnetVersion(model);
  if (sonnet != null && (sonnet.major > 4 || (sonnet.major === 4 && sonnet.minor >= 6))) {
    return true;
  }
  return false;
}

/**
 * Checks if a model omits `thinking` content from responses by default.
 *
 * Starting with Claude Opus 4.7, the Messages API returns empty `thinking`
 * blocks unless the request explicitly opts in via `thinking.display =
 * "summarized"`. This helper narrows the opt-in to Opus 4.7+ (and any future
 * major Opus version) so older adaptive-thinking models are left untouched.
 *
 * See https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-7#thinking-content-omitted-by-default
 */
export function omitsThinkingByDefault(model: string): boolean {
  const opus = parseOpusVersion(model);
  if (opus && (opus.major > 4 || (opus.major === 4 && opus.minor >= 7))) {
    return true;
  }
  return false;
}

/** Checks if a model qualifies for the context-1m beta header (Sonnet 4+, Opus 4.6+, Opus 5+) */
export function supportsContext1m(model: string): boolean {
  const sonnet = parseSonnetVersion(model);
  if (sonnet != null && sonnet.major >= 4) {
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
    thinkingDisplay: true,
    reasoning_effort: true,
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
      if (obj.thinkingDisplay == null) {
        const persistedDisplay = extractPersistedDisplay({ thinking });
        if (
          persistedDisplay === s.ThinkingDisplay.summarized ||
          persistedDisplay === s.ThinkingDisplay.omitted
        ) {
          obj.thinkingDisplay = persistedDisplay as s.ThinkingDisplay;
        }
      }
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
    thinkingDisplay: true,
    reasoning_effort: true,
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
          delete additionalFields.thinkingDisplay;
        } else {
          /**
           * Persisted agent `model_parameters` round-trip back through this
           * parser with the prior `thinking.display` embedded in
           * `additionalModelRequestFields`. Surface it as the resolver's
           * explicit value when no top-level `thinkingDisplay` is set so the
           * prior user choice (e.g. 'omitted') survives instead of being
           * clobbered by the Opus 4.7+ auto → 'summarized' fallback.
           */
          const topLevelDisplay = additionalFields.thinkingDisplay as
            | s.ThinkingDisplay
            | string
            | null
            | undefined;
          const persistedDisplay = extractPersistedDisplay(typedData.additionalModelRequestFields);
          const thinkingConfig: ThinkingConfig = { type: 'adaptive' };
          const display = resolveThinkingDisplay(
            typedData.model as string,
            topLevelDisplay ?? persistedDisplay,
          );
          if (display) {
            thinkingConfig.display = display;
          }
          additionalFields.thinking = thinkingConfig;
          delete additionalFields.thinkingBudget;
          delete additionalFields.thinkingDisplay;
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
        delete additionalFields.thinkingDisplay;
      }

      /** Anthropic uses 'effort' via output_config, not reasoning_config */
      delete additionalFields.reasoning_effort;

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
      delete additionalFields.thinkingDisplay;
      delete additionalFields.output_config;
      delete additionalFields.anthropic_beta;

      const reasoningEffort = additionalFields.reasoning_effort;
      delete additionalFields.reasoning_effort;
      if (
        typeof reasoningEffort === 'string' &&
        bedrockReasoningConfigValues.has(reasoningEffort)
      ) {
        additionalFields.reasoning_config = reasoningEffort;
      }
    }

    const isAnthropicModel =
      typeof typedData.model === 'string' && typedData.model.includes('anthropic.');

    /** Strip stale fields from previously-persisted additionalModelRequestFields */
    if (
      typeof typedData.additionalModelRequestFields === 'object' &&
      typedData.additionalModelRequestFields != null
    ) {
      const amrf = typedData.additionalModelRequestFields as Record<string, unknown>;
      if (!isAnthropicModel) {
        delete amrf.anthropic_beta;
        delete amrf.thinking;
        delete amrf.thinkingBudget;
        delete amrf.effort;
        delete amrf.output_config;
        delete amrf.reasoning_config;
      } else {
        delete amrf.reasoning_config;
        delete amrf.reasoning_effort;
      }
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
    if (updatedData.maxTokens == null && updatedData.maxOutputTokens != null) {
      updatedData.maxTokens = updatedData.maxOutputTokens;
    }
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
