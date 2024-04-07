import { ComponentTypes } from 'librechat-data-provider';
import type { DynamicSettingProps, SettingsConfiguration } from 'librechat-data-provider';
import { useSetIndexOptions } from '~/hooks';
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
    optionType: 'conversation',
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
  },
  {
    key: 'resendFiles',
    description:
      'Resend all previously attached files. Note: this will increase token cost and you may experience errors with many attachments.',
    type: 'boolean',
    default: true,
    component: 'switch',
  },
  {
    key: 'imageDetail',
    description:
      'The resolution for Vision requests. "Low" is cheaper and faster, "High" is more detailed and expensive, and "Auto" will automatically choose between the two based on the image resolution.',
    type: 'enum',
    default: 'auto',
    options: ['low', 'high', 'auto'],
    component: 'slider',
  },
  {
    key: 'promptPrefix',
    type: 'string',
    default: '',
    component: 'input',
    placeholder: 'Set custom instructions to include in System Message. Default: none',
  },
  {
    key: 'chatGptLabel',
    type: 'string',
    default: '',
    component: 'input',
    placeholder: 'Set a custom name for your AI',
  },
];

const componentMapping: Record<string, React.ComponentType<DynamicSettingProps>> = {
  [ComponentTypes.Slider]: DynamicSlider,
  // input: DynamicInput,
  // textarea: DynamicTextarea,
  // checkbox: DynamicCheckbox,
  // switch: DynamicSwitch,
  // dropdown: DynamicDropdown,
};

export default function Parameters() {
  const { setOption } = useSetIndexOptions();
  const testSetting = settingsConfiguration[0];
  const Component = componentMapping[testSetting.component];
  const { key: settingKey, default: defaultValue, ...settings } = testSetting;

  return (
    <div className="h-auto max-w-full overflow-x-hidden p-3">
      <div className="grid grid-cols-5 gap-6">
        {' '}
        {/* This is the parent element containing all settings */}
        {/* Below is an example of an applied dynamic setting, each be contained by a div with the column span specified */}
        <Component
          settingKey={settingKey}
          defaultValue={defaultValue}
          {...settings}
          setOption={setOption}
        />
      </div>
    </div>
  );
}
