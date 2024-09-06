import { useMemo } from 'react';
import { getSettingsKeys, ComponentTypes } from 'librechat-data-provider';
import type { DynamicSettingProps } from 'librechat-data-provider';
import { useSetIndexOptions } from '~/hooks';
import { useChatContext } from '~/Providers';
import { settings } from './settings';
import {
  DynamicDropdown,
  DynamicCheckbox,
  DynamicTextarea,
  DynamicSlider,
  DynamicSwitch,
  DynamicInput,
  DynamicTags,
} from './';

const componentMapping: Record<ComponentTypes, React.ComponentType<DynamicSettingProps>> = {
  [ComponentTypes.Slider]: DynamicSlider,
  [ComponentTypes.Dropdown]: DynamicDropdown,
  [ComponentTypes.Switch]: DynamicSwitch,
  [ComponentTypes.Textarea]: DynamicTextarea,
  [ComponentTypes.Input]: DynamicInput,
  [ComponentTypes.Checkbox]: DynamicCheckbox,
  [ComponentTypes.Tags]: DynamicTags,
};

export default function Parameters() {
  const { conversation } = useChatContext();
  const { setOption } = useSetIndexOptions();

  const parameters = useMemo(() => {
    const [combinedKey, endpointKey] = getSettingsKeys(
      conversation?.endpoint ?? '',
      conversation?.model ?? '',
    );
    return settings[combinedKey] ?? settings[endpointKey];
  }, [conversation]);

  if (!parameters) {
    return null;
  }

  return (
    <div className="h-auto max-w-full overflow-x-hidden p-3">
      <div className="grid grid-cols-4 gap-6">
        {' '}
        {/* This is the parent element containing all settings */}
        {/* Below is an example of an applied dynamic setting, each be contained by a div with the column span specified */}
        {parameters.map((setting) => {
          const Component = componentMapping[setting.component];
          const { key, default: defaultValue, ...rest } = setting;

          return (
            <Component
              key={key}
              settingKey={key}
              defaultValue={defaultValue}
              {...rest}
              setOption={setOption}
              conversation={conversation}
            />
          );
        })}
      </div>
    </div>
  );
}
