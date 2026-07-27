import { useMemo } from 'react';
import keyBy from 'lodash/keyBy';
import {
  paramSettings,
  getSettingsKeys,
  getEndpointField,
  applyModelAwareDefaults,
} from 'librechat-data-provider';
import type { TConversation, SettingDefinition } from 'librechat-data-provider';
import { useGetEndpointsQuery } from '~/data-provider';

/**
 * Reasoning is spelled differently per provider: Anthropic exposes `effort`,
 * OpenAI and Bedrock `reasoning_effort`, Google `thinkingLevel`. Probed in
 * order, first hit wins — no endpoint defines more than one.
 */
const REASONING_KEYS = ['effort', 'reasoning_effort', 'thinkingLevel'] as const;

/**
 * Resolves the reasoning-effort parameter definition for the active
 * conversation, or `null` when the model exposes none. Mirrors the resolution
 * in the Parameters panel — same `getSettingsKeys` lookup, same custom-param
 * overrides, same model-aware defaults — so the composer slider and the panel
 * control can never disagree about which key is in play.
 */
export default function useThinkingSetting(
  conversation: TConversation | null,
): SettingDefinition | null {
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const provider = conversation?.endpoint ?? '';
  const model = conversation?.model ?? '';

  const endpointType = useMemo(
    () => getEndpointField(endpointsConfig, conversation?.endpoint, 'type'),
    [conversation?.endpoint, endpointsConfig],
  );

  return useMemo(() => {
    if (provider === '') {
      return null;
    }
    const customParams = endpointsConfig[provider]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(endpointType ?? provider, model);
    const overriddenEndpointKey = customParams.defaultParamsEndpoint ?? endpointKey;
    const defaultParams = paramSettings[combinedKey] ?? paramSettings[overriddenEndpointKey] ?? [];
    const overriddenParamsMap = keyBy(
      endpointsConfig[provider]?.customParams?.paramDefinitions ?? [],
      'key',
    );
    const modelAwareParams = applyModelAwareDefaults(
      defaultParams.filter((param) => param != null),
      overriddenEndpointKey,
      model,
    );

    const byKey = new Map<string, SettingDefinition>();
    for (const param of modelAwareParams) {
      /* Merged, not replaced: an override that names only a default would
         otherwise drop the built-in `options`, and a reasoning setting without
         options is not rendered at all — the control would simply vanish. */
      const override = overriddenParamsMap[param.key];
      const resolved: SettingDefinition = override != null ? { ...param, ...override } : param;
      byKey.set(resolved.key, resolved);
    }

    for (const key of REASONING_KEYS) {
      const setting = byKey.get(key);
      /* Only enum-style definitions render as a discrete slider; a bare
         numeric budget belongs in the parameters panel, not the composer. */
      if (setting != null && (setting.options?.length ?? 0) > 0) {
        return setting;
      }
    }
    return null;
  }, [provider, model, endpointType, endpointsConfig]);
}
