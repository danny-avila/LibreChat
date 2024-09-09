import { useMemo } from 'react';
import { getSettingsKeys } from 'librechat-data-provider';
import type { SettingDefinition } from 'librechat-data-provider';
import type { TModelSelectProps } from '~/common';
import { componentMapping } from '~/components/SidePanel/Parameters/components';
import { presetSettings } from '~/components/SidePanel/Parameters/settings';

export default function BedrockSettings({
  conversation,
  setOption,
  models,
  readonly,
}: TModelSelectProps) {
  const parameters = useMemo(() => {
    const [combinedKey, endpointKey] = getSettingsKeys(
      conversation?.endpoint ?? '',
      conversation?.model ?? '',
    );
    return presetSettings[combinedKey] ?? presetSettings[endpointKey];
  }, [conversation]);

  if (!parameters) {
    return null;
  }

  const renderComponent = (setting: SettingDefinition) => {
    const Component = componentMapping[setting.component];
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
