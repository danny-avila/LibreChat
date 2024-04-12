/* eslint-disable jest/no-conditional-expect */
import { ZodError, z } from 'zod';
import { generateDynamicSchema, validateSettingDefinitions, OptionTypes } from '../src/generate';
import type { SettingsConfiguration } from '../src/generate';

describe('generateDynamicSchema', () => {
  it('should generate a schema for number settings with range', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'testNumber',
        description: 'A test number setting',
        type: 'number',
        default: 5,
        range: { min: 1, max: 10, step: 1 },
        component: 'slider',
        optionType: 'conversation',
        columnSpan: 2,
        label: 'Test Number Slider',
      },
    ];

    const schema = generateDynamicSchema(settings);
    const result = schema.safeParse({ testNumber: 6 });

    expect(result.success).toBeTruthy();
    expect(result['data']).toEqual({ testNumber: 6 });
  });

  it('should generate a schema for boolean settings', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'testBoolean',
        description: 'A test boolean setting',
        type: 'boolean',
        default: true,
        component: 'switch',
        optionType: 'model', // Only if relevant to your application's context
        columnSpan: 1,
        label: 'Test Boolean Switch',
      },
    ];

    const schema = generateDynamicSchema(settings);
    const result = schema.safeParse({ testBoolean: false });

    expect(result.success).toBeTruthy();
    expect(result['data']).toEqual({ testBoolean: false });
  });

  it('should generate a schema for string settings', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'testString',
        description: 'A test string setting',
        type: 'string',
        default: 'default value',
        component: 'input',
        optionType: 'model', // Optional and only if relevant
        columnSpan: 3,
        label: 'Test String Input',
        placeholder: 'Enter text here...',
        minText: 0, // Optional
        maxText: 100, // Optional
      },
    ];

    const schema = generateDynamicSchema(settings);
    const result = schema.safeParse({ testString: 'custom value' });

    expect(result.success).toBeTruthy();
    expect(result['data']).toEqual({ testString: 'custom value' });
  });

  it('should generate a schema for enum settings', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'testEnum',
        description: 'A test enum setting',
        type: 'enum',
        default: 'option1',
        options: ['option1', 'option2', 'option3'],
        enumMappings: {
          option1: 'First Option',
          option2: 'Second Option',
          option3: 'Third Option',
        },
        component: 'dropdown',
        columnSpan: 2,
        label: 'Test Enum Dropdown',
      },
    ];

    const schema = generateDynamicSchema(settings);
    const result = schema.safeParse({ testEnum: 'option2' });

    expect(result.success).toBeTruthy();
    expect(result['data']).toEqual({ testEnum: 'option2' });
  });

  it('should fail for incorrect enum value', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'testEnum',
        description: 'A test enum setting',
        type: 'enum',
        default: 'option1',
        options: ['option1', 'option2', 'option3'],
        component: 'dropdown',
      },
    ];

    const schema = generateDynamicSchema(settings);
    const result = schema.safeParse({ testEnum: 'option4' }); // This option does not exist

    expect(result.success).toBeFalsy();
  });
});

describe('validateSettingDefinitions', () => {
  test('should throw error for Conversation optionType', () => {
    const validSettings: SettingsConfiguration = [
      {
        key: 'themeColor',
        component: 'input',
        type: 'string',
        default: '#ffffff',
        label: 'Theme Color',
        columns: 2,
        columnSpan: 1,
        optionType: OptionTypes.Conversation,
      },
    ];

    expect(() => validateSettingDefinitions(validSettings)).toThrow();
  });

  test('should throw error for Model optionType', () => {
    const validSettings: SettingsConfiguration = [
      {
        key: 'themeColor',
        component: 'input',
        type: 'string',
        default: '#ffffff',
        label: 'Theme Color',
        columns: 2,
        columnSpan: 1,
        optionType: OptionTypes.Model,
      },
    ];

    expect(() => validateSettingDefinitions(validSettings)).toThrow();
  });

  test('should not throw error for valid settings', () => {
    const validSettings: SettingsConfiguration = [
      {
        key: 'themeColor',
        component: 'input',
        type: 'string',
        default: '#ffffff',
        label: 'Theme Color',
        columns: 2,
        columnSpan: 1,
        optionType: OptionTypes.Custom,
      },
      {
        key: 'fontSize',
        component: 'slider',
        type: 'number',
        range: { min: 8, max: 36 },
        default: 14,
        columnSpan: 2,
        optionType: OptionTypes.Custom,
      },
    ];

    expect(() => validateSettingDefinitions(validSettings)).not.toThrow();
  });

  // Test for incorrectly configured columns
  test('should throw error for invalid columns configuration', () => {
    const invalidSettings: SettingsConfiguration = [
      {
        key: 'themeColor',
        component: 'input',
        type: 'string',
        columns: 5,
      },
    ];

    expect(() => validateSettingDefinitions(invalidSettings)).toThrow(ZodError);
  });

  test('should correctly handle columnSpan defaulting based on columns', () => {
    const settingsWithColumnAdjustment: SettingsConfiguration = [
      {
        key: 'fontSize',
        component: 'slider',
        type: 'number',
        columns: 4,
        range: { min: 8, max: 14 },
        default: 11,
        optionType: OptionTypes.Custom,
      },
    ];

    expect(() => validateSettingDefinitions(settingsWithColumnAdjustment)).not.toThrow();
  });

  // Test for label defaulting to key if not provided
  test('label should default to key if not explicitly set', () => {
    const settingsWithDefaultLabel: SettingsConfiguration = [
      {
        key: 'fontWeight',
        component: 'dropdown',
        type: 'string',
        options: ['normal', 'bold'],
        optionType: OptionTypes.Custom,
      },
    ];

    expect(() => validateSettingDefinitions(settingsWithDefaultLabel)).not.toThrow();
    expect(settingsWithDefaultLabel[0].label).toBe('fontWeight');
  });

  // Test for minText and maxText in input/textarea component
  test('should throw error for negative minText or maxText', () => {
    const settingsWithNegativeTextLimits: SettingsConfiguration = [
      { key: 'biography', component: 'textarea', type: 'string', minText: -1 },
    ];

    expect(() => validateSettingDefinitions(settingsWithNegativeTextLimits)).toThrow(ZodError);
  });

  // Validate optionType with tConversationSchema
  test('should throw error for optionType "conversation" not matching schema', () => {
    const settingsWithInvalidConversationOptionType: SettingsConfiguration = [
      { key: 'userAge', component: 'input', type: 'number', optionType: 'conversation' },
    ];

    expect(() => validateSettingDefinitions(settingsWithInvalidConversationOptionType)).toThrow(
      ZodError,
    );
  });

  // Test for columnSpan defaulting and label defaulting to key
  test('columnSpan defaults based on columns and label defaults to key if not set', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'textSize',
        type: 'number',
        component: 'slider',
        range: { min: 10, max: 20 },
        columns: 4,
        optionType: OptionTypes.Custom,
      },
    ];

    validateSettingDefinitions(settings); // Perform validation which also mutates settings with default values

    expect(settings[0].columnSpan).toBe(2); // Expects columnSpan to default based on columns
    expect(settings[0].label).toBe('textSize'); // Expects label to default to key
  });

  // Test for errors thrown due to invalid columns value
  test('throws error if columns value is out of range', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'themeMode',
        type: 'string',
        component: 'dropdown',
        options: ['dark', 'light'],
        columns: 5,
      },
    ];

    expect(() => validateSettingDefinitions(settings)).toThrow(ZodError);
  });

  // Test range validation for slider component
  test('slider component range validation', () => {
    const settings: SettingsConfiguration = [
      { key: 'volume', type: 'number', component: 'slider' }, // Missing range
    ];

    expect(() => validateSettingDefinitions(settings)).toThrow(ZodError);
  });

  // Test options validation for enum type in slider component
  test('slider component with enum type requires at least 2 options', () => {
    const settings: SettingsConfiguration = [
      { key: 'color', type: 'enum', component: 'slider', options: ['red'] }, // Not enough options
    ];

    expect(() => validateSettingDefinitions(settings)).toThrow(ZodError);
  });

  // Test checkbox component options validation
  test('checkbox component must have 1-2 options if options are provided', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'agreeToTerms',
        type: 'boolean',
        component: 'checkbox',
        options: ['Yes', 'No', 'Maybe'],
      }, // Too many options
    ];

    expect(() => validateSettingDefinitions(settings)).toThrow(ZodError);
  });

  // Test dropdown component options validation
  test('dropdown component requires at least 2 options', () => {
    const settings: SettingsConfiguration = [
      { key: 'country', type: 'enum', component: 'dropdown', options: ['USA'] }, // Not enough options
    ];

    expect(() => validateSettingDefinitions(settings)).toThrow(ZodError);
  });

  // Validate minText and maxText constraints in input and textarea
  test('validate minText and maxText constraints', () => {
    const settings: SettingsConfiguration = [
      { key: 'biography', type: 'string', component: 'textarea', minText: 10, maxText: 5 }, // Incorrect minText and maxText
    ];

    expect(() => validateSettingDefinitions(settings)).toThrow(ZodError);
  });

  // Validate optionType constraint with tConversationSchema
  test('validate optionType constraint with tConversationSchema', () => {
    const settings: SettingsConfiguration = [
      { key: 'userAge', type: 'number', component: 'input', optionType: 'conversation' }, // No corresponding schema in tConversationSchema
    ];

    expect(() => validateSettingDefinitions(settings)).toThrow(ZodError);
  });

  // Validate correct handling of boolean settings with default values
  test('correct handling of boolean settings with defaults', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'enableFeatureX',
        type: 'boolean',
        component: 'switch',
        optionType: OptionTypes.Custom,
      }, // Missing default, should default to false
    ];

    validateSettingDefinitions(settings); // This would populate default values where missing

    expect(settings[0].default).toBe(false); // Expects default to be false for boolean without explicit default
  });

  // Validate that number slider without default uses middle of range
  test('number slider without default uses middle of range', () => {
    const settings: SettingsConfiguration = [
      {
        key: 'brightness',
        type: 'number',
        component: 'slider',
        range: { min: 0, max: 100 },
        optionType: OptionTypes.Custom,
      }, // Missing default
    ];

    validateSettingDefinitions(settings); // This would populate default values where missing

    expect(settings[0].default).toBe(50); // Expects default to be midpoint of range
  });
});

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
    optionType: OptionTypes.Custom,
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
    optionType: OptionTypes.Custom,
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
    optionType: OptionTypes.Custom,
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
    optionType: OptionTypes.Custom,
  },
  {
    key: 'resendFiles',
    description:
      'Resend all previously attached files. Note: this will increase token cost and you may experience errors with many attachments.',
    type: 'boolean',
    default: true,
    component: 'switch',
    optionType: OptionTypes.Custom,
  },
  {
    key: 'imageDetail',
    description:
      'The resolution for Vision requests. "Low" is cheaper and faster, "High" is more detailed and expensive, and "Auto" will automatically choose between the two based on the image resolution.',
    type: 'enum',
    default: 'auto',
    options: ['low', 'high', 'auto'],
    component: 'slider',
    optionType: OptionTypes.Custom,
  },
  {
    key: 'promptPrefix',
    type: 'string',
    default: '',
    component: 'input',
    optionType: OptionTypes.Custom,
    placeholder: 'Set custom instructions to include in System Message. Default: none',
  },
  {
    key: 'chatGptLabel',
    type: 'string',
    default: '',
    component: 'input',
    optionType: OptionTypes.Custom,
    placeholder: 'Set a custom name for your AI',
  },
];

describe('Settings Validation and Schema Generation', () => {
  // Test 1: Validate settings definitions do not throw for valid configuration
  test('validateSettingDefinitions does not throw for valid configuration', () => {
    expect(() => validateSettingDefinitions(settingsConfiguration)).not.toThrow();
  });

  test('validateSettingDefinitions throws for invalid type in settings', () => {
    const settingsWithInvalidType = [
      ...settingsConfiguration,
      {
        key: 'newSetting',
        description: 'A setting with an unsupported type',
        type: 'unsupportedType', // Assuming 'unsupportedType' is not supported
        component: 'input',
      },
    ];

    expect(() =>
      validateSettingDefinitions(settingsWithInvalidType as SettingsConfiguration),
    ).toThrow();
  });

  test('validateSettingDefinitions throws for missing required fields', () => {
    const settingsMissingRequiredField = [
      ...settingsConfiguration,
      {
        key: 'incompleteSetting',
        type: 'number',
        // Missing 'component',
      },
    ];

    expect(() =>
      validateSettingDefinitions(settingsMissingRequiredField as SettingsConfiguration),
    ).toThrow();
  });

  test('validateSettingDefinitions throws for default value out of range', () => {
    const settingsOutOfRange = [
      ...settingsConfiguration,
      {
        key: 'rangeTestSetting',
        description: 'A setting with default value out of specified range',
        type: 'number',
        default: 5,
        range: {
          min: 0,
          max: 1,
        },
        component: 'slider',
      },
    ];

    expect(() => validateSettingDefinitions(settingsOutOfRange as SettingsConfiguration)).toThrow();
  });

  test('validateSettingDefinitions throws for enum setting with incorrect default', () => {
    const settingsWithIncorrectEnumDefault = [
      ...settingsConfiguration,
      {
        key: 'enumSetting',
        description: 'Enum setting with a default not in options',
        type: 'enum',
        default: 'unlistedOption',
        options: ['option1', 'option2'],
        component: 'dropdown',
      },
    ];

    expect(() =>
      validateSettingDefinitions(settingsWithIncorrectEnumDefault as SettingsConfiguration),
    ).toThrow();
  });

  // Test 2: Generate dynamic schema and validate correct input
  test('generateDynamicSchema generates a schema that validates correct input', () => {
    const schema = generateDynamicSchema(settingsConfiguration);
    const validInput = {
      temperature: 0.5,
      top_p: 0.8,
      presence_penalty: 1,
      frequency_penalty: -1,
      resendFiles: true,
      imageDetail: 'high',
      promptPrefix: 'Hello, AI.',
      chatGptLabel: 'My Custom AI',
    };

    expect(schema.parse(validInput)).toEqual(validInput);
  });

  // Test 3: Generate dynamic schema and catch invalid input
  test('generateDynamicSchema generates a schema that catches invalid input and provides detailed errors', async () => {
    const schema = generateDynamicSchema(settingsConfiguration);
    const invalidInput: z.infer<typeof schema> = {
      temperature: 2.5, // Out of range
      top_p: -0.5, // Out of range
      presence_penalty: 3, // Out of range
      frequency_penalty: -3, // Out of range
      resendFiles: 'yes', // Wrong type
      imageDetail: 'ultra', // Invalid option
      promptPrefix: 123, // Wrong type
      chatGptLabel: true, // Wrong type
    };

    const result = schema.safeParse(invalidInput);
    expect(result.success).toBeFalsy();
    if (!result.success) {
      const errorPaths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(errorPaths).toContain('temperature');
      expect(errorPaths).toContain('top_p');
      expect(errorPaths).toContain('presence_penalty');
      expect(errorPaths).toContain('frequency_penalty');
      expect(errorPaths).toContain('resendFiles');
      expect(errorPaths).toContain('imageDetail');
      expect(errorPaths).toContain('promptPrefix');
      expect(errorPaths).toContain('chatGptLabel');
    }
  });
});
