import { useEffect, useMemo } from 'react';
import { presetSettings } from 'librechat-data-provider';
import { applyModelAwareDefaults, getSettingsKeys } from 'librechat-data-provider';
import type { SettingDefinition } from 'librechat-data-provider';
import type { TModelSelectProps } from '~/common';
import { componentMapping } from '~/components/SidePanel/Parameters/components';
import { useGetEndpointsQuery } from '~/data-provider';

const modelAwareKeys = [
  'reasoning_mode',
  'reasoning_context',
  'priorityProcessing',
  'promptCache',
] as const;

export default function OpenAISettings({
  conversation,
  setOption,
  models,
  readonly,
}: TModelSelectProps) {
  const { data: endpointsConfig = {} } = useGetEndpointsQuery();
  const parameters = useMemo(() => {
    const provider = conversation?.endpoint ?? '';
    const [combinedKey, endpointKey] = getSettingsKeys(
      conversation?.endpointType ?? conversation?.endpoint ?? '',
      conversation?.model ?? '',
    );
    const settings = presetSettings[combinedKey] ?? presetSettings[endpointKey];
    if (!settings) {
      return;
    }
    const model = conversation?.model ?? '';
    const options = {
      provider,
      useResponsesApi: conversation?.useResponsesApi === true,
      priorityModels: endpointsConfig[provider]?.priorityModels,
    };
    return {
      col1: applyModelAwareDefaults(settings.col1, endpointKey, model, options),
      col2: applyModelAwareDefaults(settings.col2, endpointKey, model, options),
    };
  }, [conversation, endpointsConfig]);

  useEffect(() => {
    if (readonly || !parameters || !conversation) {
      return;
    }
    const visibleKeys = new Set([
      ...parameters.col1.map((setting) => setting.key),
      ...parameters.col2.map((setting) => setting.key),
    ]);
    const values = conversation as Record<string, unknown>;
    for (const key of modelAwareKeys) {
      if (!visibleKeys.has(key) && values[key] !== undefined) {
        setOption(key)(undefined);
      }
    }
  }, [conversation, parameters, readonly, setOption]);

  if (!parameters) {
    return null;
  }

  const renderComponent = (setting: SettingDefinition | undefined) => {
    if (!setting) {
      return null;
    }
    const Component = componentMapping[setting.component];
    if (!Component) {
      return null;
    }
    const { key, default: defaultValue, ...rest } = setting;

    const props = {
      key,
      settingKey: key,
      defaultValue,
      ...rest,
      readonly,
      setOption,
      conversation,
    };

    if (key === 'model') {
      return <Component {...props} options={models} />;
    }

    return <Component {...props} />;
  };

  return (
    <div className="h-auto max-w-full overflow-x-hidden p-3">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
        <div className="flex flex-col gap-6 md:col-span-3">
          {parameters.col1.map(renderComponent)}
        </div>
        <div className="flex flex-col gap-6 md:col-span-2">
          {parameters.col2.map(renderComponent)}
        </div>
      </div>
    </div>
  );
}
