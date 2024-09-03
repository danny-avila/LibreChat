import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { ComponentTypes } from 'librechat-data-provider';
import type { DynamicSettingProps, SettingsConfiguration } from 'librechat-data-provider';
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
    // columnSpan: 2,
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
    columnSpan: 4,
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
  const methods = useForm({
    defaultValues: settingsConfiguration.reduce((acc, setting) => {
      acc[setting.key] = setting.default;
      return acc;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }, {} as Record<string, any>),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = (data: Record<string, any>) => {
    console.log('Form data:', data);
    // Here you can handle the form submission, e.g., send the data to an API
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>
        <div className="h-auto max-w-full overflow-x-hidden p-3">
          <div className="grid grid-cols-4 gap-6">
            {settingsConfiguration.map((setting) => {
              const Component = componentMapping[setting.component];
              const { key, default: defaultValue, ...rest } = setting;

              return <Component key={key} settingKey={key} defaultValue={defaultValue} {...rest} />;
            })}
          </div>
        </div>
        <button type="submit" className="mt-4 rounded bg-blue-500 px-4 py-2 text-white">
          Submit
        </button>
      </form>
    </FormProvider>
  );
}
