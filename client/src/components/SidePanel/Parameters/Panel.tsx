import { ComponentTypes } from 'librechat-data-provider';
import type {
  DynamicSettingProps,
  SettingDefinition,
  SettingsConfiguration,
} from 'librechat-data-provider';
import { useSetIndexOptions } from '~/hooks';
import { useChatContext } from '~/Providers';
import {
  DynamicDropdown,
  DynamicCheckbox,
  DynamicTextarea,
  DynamicSlider,
  DynamicSwitch,
  DynamicInput,
  DynamicTags,
} from './';

const settingsConfiguration: SettingsConfiguration = [
  {
    key: 'chatGptLabel',
    label: 'com_endpoint_custom_name',
    labelCode: true,
    type: 'string',
    default: '',
    component: 'input',
    placeholder: 'com_endpoint_openai_custom_name_placeholder',
    placeholderCode: true,
    optionType: 'conversation',
  },
  {
    key: 'promptPrefix',
    label: 'com_endpoint_prompt_prefix',
    labelCode: true,
    type: 'string',
    default: '',
    component: 'textarea',
    placeholder: 'com_endpoint_openai_prompt_prefix_placeholder',
    placeholderCode: true,
    optionType: 'conversation',
    // columnSpan: 2,
  },
  {
    key: 'temperature',
    label: 'com_endpoint_temperature',
    labelCode: true,
    description: 'com_endpoint_openai_temp',
    descriptionCode: true,
    type: 'number',
    default: 1,
    range: {
      min: 0,
      max: 2,
      step: 0.01,
    },
    component: 'slider',
    optionType: 'model',
    columnSpan: 4,
    // includeInput: false,
  },
  {
    key: 'top_p',
    label: 'com_endpoint_top_p',
    labelCode: true,
    description: 'com_endpoint_openai_topp',
    descriptionCode: true,
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
    label: 'com_endpoint_presence_penalty',
    labelCode: true,
    description: 'com_endpoint_openai_pres',
    descriptionCode: true,
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
    label: 'com_endpoint_frequency_penalty',
    labelCode: true,
    description: 'com_endpoint_openai_freq',
    descriptionCode: true,
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
    key: 'resendFiles',
    label: 'com_endpoint_plug_resend_files',
    labelCode: true,
    description: 'com_endpoint_openai_resend_files',
    descriptionCode: true,
    type: 'boolean',
    default: true,
    component: 'switch',
    optionType: 'conversation',
    showDefault: false,
    columnSpan: 2,
  },
  {
    key: 'imageDetail',
    label: 'com_endpoint_plug_image_detail',
    labelCode: true,
    description: 'com_endpoint_openai_detail',
    descriptionCode: true,
    type: 'enum',
    default: 'auto',
    options: ['low', 'auto', 'high'],
    optionType: 'conversation',
    component: 'slider',
    showDefault: false,
    columnSpan: 2,
  },
  {
    key: 'stop',
    label: 'com_endpoint_stop',
    labelCode: true,
    description: 'com_endpoint_openai_stop',
    descriptionCode: true,
    placeholder: 'com_endpoint_stop_placeholder',
    placeholderCode: true,
    type: 'array',
    default: [],
    component: 'tags',
    optionType: 'conversation',
    // columnSpan: 4,
    minTags: 1,
    maxTags: 4,
  },
];

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

  const temperature = settingsConfiguration.find(
    (setting) => setting.key === 'temperature',
  ) as SettingDefinition;
  const TempComponent = componentMapping[temperature.component];
  const { key: temp, default: tempDefault, ...tempSettings } = temperature;

  const imageDetail = settingsConfiguration.find(
    (setting) => setting.key === 'imageDetail',
  ) as SettingDefinition;
  const DetailComponent = componentMapping[imageDetail.component];
  const { key: detail, default: detailDefault, ...detailSettings } = imageDetail;

  const resendFiles = settingsConfiguration.find(
    (setting) => setting.key === 'resendFiles',
  ) as SettingDefinition;
  const Switch = componentMapping[resendFiles.component];
  const { key: switchKey, default: switchDefault, ...switchSettings } = resendFiles;

  const promptPrefix = settingsConfiguration.find(
    (setting) => setting.key === 'promptPrefix',
  ) as SettingDefinition;
  const Textarea = componentMapping[promptPrefix.component];
  const { key: textareaKey, default: textareaDefault, ...textareaSettings } = promptPrefix;

  const chatGptLabel = settingsConfiguration.find(
    (setting) => setting.key === 'chatGptLabel',
  ) as SettingDefinition;
  const Input = componentMapping[chatGptLabel.component];
  const { key: inputKey, default: inputDefault, ...inputSettings } = chatGptLabel;

  const stop = settingsConfiguration.find((setting) => setting.key === 'stop') as SettingDefinition;
  const Tags = componentMapping[stop.component];
  const { key: stopKey, default: stopDefault, ...stopSettings } = stop;

  return (
    <div className="h-auto max-w-full overflow-x-hidden p-3">
      <div className="grid grid-cols-4 gap-6">
        {' '}
        {/* This is the parent element containing all settings */}
        {/* Below is an example of an applied dynamic setting, each be contained by a div with the column span specified */}
        <Input
          settingKey={inputKey}
          defaultValue={inputDefault}
          {...inputSettings}
          setOption={setOption}
          conversation={conversation}
        />
        <Textarea
          settingKey={textareaKey}
          defaultValue={textareaDefault}
          {...textareaSettings}
          setOption={setOption}
          conversation={conversation}
        />
        <TempComponent
          settingKey={temp}
          defaultValue={tempDefault}
          {...tempSettings}
          setOption={setOption}
          conversation={conversation}
        />
        <Switch
          settingKey={switchKey}
          defaultValue={switchDefault}
          {...switchSettings}
          setOption={setOption}
          conversation={conversation}
        />
        <DetailComponent
          settingKey={detail}
          defaultValue={detailDefault}
          {...detailSettings}
          setOption={setOption}
          conversation={conversation}
        />
        <Tags
          settingKey={stopKey}
          defaultValue={stopDefault}
          {...stopSettings}
          setOption={setOption}
          conversation={conversation}
        />
      </div>
    </div>
  );
}
