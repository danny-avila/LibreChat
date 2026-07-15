import type { SettingDefinition } from './generate';
import type { TConversation } from './schemas';
import type { TModelSpec } from './models';
import {
  AnthropicEffort,
  EModelEndpoint,
  ReasoningEffort,
  ThinkingLevel,
  getSettingsKeys,
  isAgentsEndpoint,
  isAssistantsEndpoint,
} from './schemas';
import { supportsAdaptiveThinking } from './bedrock';
import { paramSettings } from './parameterSettings';

export type ReasoningParameterKey =
  | 'reasoning_effort'
  | 'effort'
  | 'thinkingLevel'
  | 'thinkingBudget';

const reasoningParameterKeys: readonly ReasoningParameterKey[] = [
  'reasoning_effort',
  'effort',
  'thinkingLevel',
  'thinkingBudget',
];

export type ModelSpecReasoningValue = string | number;
export type ModelSpecReasoningValues = Partial<Pick<TConversation, ReasoningParameterKey>>;

export type ModelSpecReasoningSetting = {
  key: ReasoningParameterKey;
  options: ModelSpecReasoningValue[];
  defaultValue?: ModelSpecReasoningValue;
  enumMappings?: Record<string, number | boolean | string>;
};

type ResolveModelSpecReasoningParams = {
  modelSpec?: TModelSpec;
  endpoint?: string | null;
  endpointType?: string | null;
  defaultParamsEndpoint?: string | null;
  paramDefinitions?: Partial<SettingDefinition>[];
};

const reasoningEfforts = new Set<string>(Object.values(ReasoningEffort));
const anthropicEfforts = new Set<string>(Object.values(AnthropicEffort));
const thinkingLevels = new Set<string>(Object.values(ThinkingLevel));
const nativeReasoningEndpoints = new Set<string>([
  EModelEndpoint.openAI,
  EModelEndpoint.azureOpenAI,
  EModelEndpoint.anthropic,
  EModelEndpoint.google,
  EModelEndpoint.bedrock,
]);

export function supportsGoogleThinkingLevel(model: string): boolean {
  return /gemini-([3-9]|\d{2,})|gemma-([4-9]|\d{2,})/i.test(model);
}

function isValidReasoningValue(
  key: ReasoningParameterKey,
  value: unknown,
): value is ModelSpecReasoningValue {
  if (key === 'thinkingBudget') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  if (key === 'reasoning_effort') {
    return reasoningEfforts.has(value);
  }
  if (key === 'effort') {
    return anthropicEfforts.has(value);
  }
  return thinkingLevels.has(value);
}

function getPreferredReasoningKey(
  endpoint: string | undefined,
  model: string,
): ReasoningParameterKey | undefined {
  if (endpoint === EModelEndpoint.bedrock) {
    return undefined;
  }
  if (endpoint === EModelEndpoint.anthropic) {
    return supportsAdaptiveThinking(model) ? 'effort' : 'thinkingBudget';
  }
  if (endpoint === EModelEndpoint.google) {
    return supportsGoogleThinkingLevel(model) ? 'thinkingLevel' : 'thinkingBudget';
  }
  return 'reasoning_effort';
}

function resolveReasoningKey({
  modelSpec,
  endpoint,
  paramEndpoint,
  paramDefinitions,
}: {
  modelSpec: TModelSpec;
  endpoint?: string;
  paramEndpoint?: string;
  paramDefinitions?: Partial<SettingDefinition>[];
}): ReasoningParameterKey | undefined {
  const preferredKey = getPreferredReasoningKey(paramEndpoint, modelSpec.preset.model ?? '');
  if (!preferredKey) {
    return undefined;
  }

  if (endpoint && nativeReasoningEndpoints.has(endpoint)) {
    return preferredKey;
  }

  const configuredKeys = reasoningParameterKeys.filter((key) => modelSpec.preset[key] != null);
  const definedKeys = reasoningParameterKeys.filter((key) =>
    paramDefinitions?.some((definition) => definition.key === key),
  );
  const explicitKeys = configuredKeys.length > 0 ? configuredKeys : definedKeys;
  if (explicitKeys.includes(preferredKey) || explicitKeys.length !== 1) {
    return preferredKey;
  }
  return explicitKeys[0];
}

/** Resolves the single provider parameter represented by a model spec's composer selector. */
export function resolveModelSpecReasoning({
  modelSpec,
  endpoint,
  endpointType,
  defaultParamsEndpoint,
  paramDefinitions,
}: ResolveModelSpecReasoningParams): ModelSpecReasoningSetting | undefined {
  const targetEndpoint = endpoint ?? modelSpec?.preset.endpoint;
  if (
    !modelSpec?.reasoning ||
    isAgentsEndpoint(targetEndpoint) ||
    isAssistantsEndpoint(targetEndpoint)
  ) {
    return undefined;
  }

  const paramEndpoint =
    targetEndpoint && nativeReasoningEndpoints.has(targetEndpoint)
      ? targetEndpoint
      : (defaultParamsEndpoint ?? endpointType ?? targetEndpoint ?? undefined);
  const key = resolveReasoningKey({
    modelSpec,
    endpoint: targetEndpoint ?? undefined,
    paramEndpoint,
    paramDefinitions,
  });
  if (!key || !paramEndpoint) {
    return undefined;
  }

  const [combinedKey, endpointKey] = getSettingsKeys(paramEndpoint, modelSpec.preset.model ?? '');
  const definitions = paramSettings[combinedKey] ?? paramSettings[endpointKey] ?? [];
  const baseDefinition = definitions.find((definition) => definition.key === key);
  const customDefinition = paramDefinitions?.find((definition) => definition.key === key);
  const configuredOptions = Array.isArray(modelSpec.reasoning) ? modelSpec.reasoning : undefined;
  const rawOptions = configuredOptions ?? customDefinition?.options ?? baseDefinition?.options;
  const range = customDefinition?.range ?? baseDefinition?.range;
  if (!rawOptions) {
    return undefined;
  }

  const options = rawOptions.reduce<ModelSpecReasoningValue[]>((result, value) => {
    const isOutOfRange =
      key === 'thinkingBudget' &&
      typeof value === 'number' &&
      range != null &&
      (value < range.min || value > range.max);
    if (
      isValidReasoningValue(key, value) &&
      !isOutOfRange &&
      !result.some((existingValue) => Object.is(existingValue, value))
    ) {
      result.push(value);
    }
    return result;
  }, []);
  if (options.length === 0) {
    return undefined;
  }

  const presetDefault = modelSpec.preset[key];
  const configuredDefault = customDefinition?.default ?? baseDefinition?.default;
  let defaultValue: ModelSpecReasoningValue | undefined;
  if (isValidReasoningValue(key, presetDefault)) {
    defaultValue = presetDefault;
  } else if (isValidReasoningValue(key, configuredDefault)) {
    defaultValue = configuredDefault;
  }

  return {
    key,
    options,
    defaultValue,
    enumMappings: {
      ...baseDefinition?.enumMappings,
      ...customDefinition?.enumMappings,
    },
  };
}

export function getModelSpecReasoningValue(
  setting: ModelSpecReasoningSetting,
  values?: ModelSpecReasoningValues | null,
): ModelSpecReasoningValue {
  const currentValue = values?.[setting.key];
  if (
    (typeof currentValue === 'string' || typeof currentValue === 'number') &&
    setting.options.some((option) => Object.is(option, currentValue))
  ) {
    return currentValue;
  }
  if (
    (typeof setting.defaultValue === 'string' || typeof setting.defaultValue === 'number') &&
    setting.options.some((option) => Object.is(option, setting.defaultValue))
  ) {
    return setting.defaultValue;
  }
  return setting.options[0];
}

/** Creates a provider-native override only when the value is one of the advertised options. */
export function createModelSpecReasoningOverride(
  setting: ModelSpecReasoningSetting,
  value: unknown,
): ModelSpecReasoningValues | undefined {
  if (!setting.options.some((option) => Object.is(option, value))) {
    return undefined;
  }
  if (setting.key === 'thinkingBudget' && typeof value === 'number') {
    return { thinkingBudget: value };
  }
  if (setting.key === 'reasoning_effort' && typeof value === 'string') {
    return { reasoning_effort: value as ReasoningEffort };
  }
  if (setting.key === 'effort' && typeof value === 'string') {
    return { effort: value as AnthropicEffort };
  }
  if (setting.key === 'thinkingLevel' && typeof value === 'string') {
    return { thinkingLevel: value as ThinkingLevel };
  }
  return undefined;
}
