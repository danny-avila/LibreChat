import keyBy from 'lodash/keyBy';
import {
  agentParamSettings,
  applyModelAwareDefaults,
  getEndpointField,
  getSettingsKeys,
  normalizeEndpointName,
  resolveDropParamsUIKeys,
} from 'librechat-data-provider';
import type {
  AgentModelParameters,
  SettingDefinition,
  TEndpointsConfig,
  TStartupConfig,
} from 'librechat-data-provider';

export type AgentParameterConfig = {
  endpointsConfig?: TEndpointsConfig | null;
  startupConfig?: Pick<TStartupConfig, 'endpointsDropParamsMap'> | null;
};

export type ResolvedAgentParameterSettings = {
  parameters: SettingDefinition[];
  schemaResolved: boolean;
};

const NON_CONTROL_PARAMETER_KEYS = new Set<keyof AgentModelParameters>(['model']);

export function resolveAgentParameterSettings({
  endpointsConfig,
  model,
  provider,
  startupConfig,
}: AgentParameterConfig & {
  model: string;
  provider: string;
}): ResolvedAgentParameterSettings {
  const resolvedEndpointsConfig = endpointsConfig ?? {};
  const endpointType = getEndpointField(resolvedEndpointsConfig, provider, 'type');
  const customParams = resolvedEndpointsConfig[provider]?.customParams;
  const [combinedKey, endpointKey] = getSettingsKeys(endpointType ?? provider, model);
  const overriddenEndpointKey = customParams?.defaultParamsEndpoint ?? endpointKey;
  const dropParamsMap = startupConfig?.endpointsDropParamsMap;
  const dropParamsEntry =
    dropParamsMap?.[provider] ?? dropParamsMap?.[normalizeEndpointName(provider)];
  const resolvedDropParams = Array.isArray(dropParamsEntry)
    ? dropParamsEntry
    : dropParamsEntry?.[model];
  const dropParamsSet = resolveDropParamsUIKeys(
    Array.isArray(resolvedDropParams) ? resolvedDropParams : undefined,
    overriddenEndpointKey,
  );
  const defaultParams =
    agentParamSettings[combinedKey] ?? agentParamSettings[overriddenEndpointKey];
  const overriddenParams = customParams?.paramDefinitions;
  const overriddenParamsMap = keyBy(overriddenParams ?? [], 'key');
  const modelAwareParams = applyModelAwareDefaults(
    (defaultParams ?? []).filter((param) => param != null && !dropParamsSet.has(param.key)),
    overriddenEndpointKey,
    model,
  );

  return {
    schemaResolved: defaultParams != null || overriddenParams != null,
    parameters: modelAwareParams.map(
      (param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param,
    ),
  };
}

export function pruneAgentModelParameters(
  currentParameters: AgentModelParameters | undefined,
  settings: ResolvedAgentParameterSettings,
): AgentModelParameters {
  const normalizedParameters = currentParameters ?? ({} as AgentModelParameters);
  if (!settings.schemaResolved) {
    return normalizedParameters;
  }

  const parameterKeys = new Set(settings.parameters.map((setting) => setting.key));
  const currentKeys = Object.keys(normalizedParameters) as Array<keyof AgentModelParameters>;
  let prunedParameters: Partial<AgentModelParameters> | undefined;

  for (const key of currentKeys) {
    if (
      NON_CONTROL_PARAMETER_KEYS.has(key) ||
      parameterKeys.has(key) ||
      normalizedParameters[key] == null
    ) {
      continue;
    }

    prunedParameters ??= { ...normalizedParameters };
    delete prunedParameters[key];
  }

  return (prunedParameters ?? normalizedParameters) as AgentModelParameters;
}
