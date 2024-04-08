import { ComponentTypes } from 'librechat-data-provider';
import type {
  DynamicSettingProps,
  SettingDefinition,
  SettingsConfiguration,
} from 'librechat-data-provider';
import { useSetIndexOptions } from '~/hooks';
import DynamicDropdown from './DynamicDropdown';
import DynamicSlider from './DynamicSlider';

const settingsConfiguration: SettingsConfiguration = [
  {
    key: 'temperature',
    description:
      'Higher values = more random, while lower values = more focused and deterministic. We recommend altering this or Top P but not both.',
    type: 'number',
    default: 1,
    range: {
      min: 0,
      max: 2,
      step: 0.01,
    },
    component: 'slider',
    optionType: 'model',
    // columnSpan: 2,
    // includeInput: false,
  },
  {
    key: 'top_p',
    description:
      'An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered. We recommend altering this or temperature but not both.',
    type: 'number',
    default: 1,
    range: {
      min: 0,
      max: 1,
      step: 0.01,
    },
    component: 'slider',
    optionType: 'model',
  },
  {
    key: 'presence_penalty',
    description:
      'Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model\'s likelihood to talk about new topics.',
    type: 'number',
    default: 0,
    range: {
      min: -2,
      max: 2,
      step: 0.01,
    },
    component: 'slider',
    optionType: 'model',
  },
  {
    key: 'frequency_penalty',
    description:
      'Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model\'s likelihood to repeat the same line verbatim.',
    type: 'number',
    default: 0,
    range: {
      min: -2,
      max: 2,
      step: 0.01,
    },
    component: 'slider',
    optionType: 'model',
  },
  {
    key: 'promptPrefix',
    type: 'string',
    default: '',
    component: 'input',
    placeholder: 'Set custom instructions to include in System Message. Default: none',
    optionType: 'conversation',
  },
  {
    key: 'chatGptLabel',
    type: 'string',
    default: '',
    component: 'input',
    placeholder: 'Set a custom name for your AI',
    optionType: 'conversation',
  },
  {
    key: 'resendFiles',
    description:
      'Resend all previously attached files. Note: this will increase token cost and you may experience errors with many attachments.',
    type: 'boolean',
    default: true,
    component: 'switch',
    optionType: 'conversation',
    columnSpan: 2,
  },
  {
    key: 'imageDetail',
    label: 'Image Detail',
    description:
      'The resolution for Vision requests. "Low" is cheaper and faster, "High" is more detailed and expensive, and "Auto" will automatically choose between the two based on the image resolution.',
    type: 'enum',
    default: 'auto',
    options: ['low', 'auto', 'high'],
    optionType: 'conversation',
    component: 'slider',
    // columnSpan: 2,
  },
  {
    key: 'imageDetail',
    label: 'Detail Dropdown',
    description:
      'The resolution for Vision requests. "Low" is cheaper and faster, "High" is more detailed and expensive, and "Auto" will automatically choose between the two based on the image resolution.',
    type: 'enum',
    default: 'auto',
    options: ['low', 'auto', 'high'],
    optionType: 'conversation',
    component: 'dropdown',
    // columnSpan: 2,
  },
];

const componentMapping: Record<ComponentTypes, React.ComponentType<DynamicSettingProps>> = {
  [ComponentTypes.Slider]: DynamicSlider,
  [ComponentTypes.Dropdown]: DynamicDropdown,
  // input: DynamicInput,
  // textarea: DynamicTextarea,
  // checkbox: DynamicCheckbox,
  // switch: DynamicSwitch,
};

export default function Parameters() {
  const { setOption } = useSetIndexOptions();
  const temperature = settingsConfiguration.find(
    (setting) => setting.key === 'temperature',
  ) as SettingDefinition;
  const imageDetail = settingsConfiguration.find(
    (setting) => setting.label === 'Image Detail',
  ) as SettingDefinition;
  const testDropdown = settingsConfiguration.find(
    (setting) => setting.label === 'Detail Dropdown',
  ) as SettingDefinition;
  const TempComponent = componentMapping[temperature.component];
  const DetailComponent = componentMapping[imageDetail.component];
  const Dropdown = componentMapping[testDropdown.component];
  const { key: temp, default: tempDefault, ...tempSettings } = temperature;
  const { key: detail, default: detailDefault, ...detailSettings } = imageDetail;
  const { key: dropdown, default: dropdownDefault, ...dropdownSettings } = testDropdown;

  return (
    <div className="h-auto max-w-full overflow-x-hidden p-3">
      <div className="grid grid-cols-4 gap-6">
        {' '}
        {/* This is the parent element containing all settings */}
        {/* Below is an example of an applied dynamic setting, each be contained by a div with the column span specified */}
        <TempComponent
          settingKey={temp}
          defaultValue={tempDefault}
          {...tempSettings}
          setOption={setOption}
        />
        <DetailComponent
          settingKey={detail}
          defaultValue={detailDefault}
          {...detailSettings}
          setOption={setOption}
        />
        <Dropdown
          settingKey={dropdown}
          defaultValue={dropdownDefault}
          {...dropdownSettings}
          setOption={setOption}
        />
      </div>
    </div>
  );
}
