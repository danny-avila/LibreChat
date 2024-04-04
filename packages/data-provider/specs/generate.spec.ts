import { ZodError } from 'zod';
import { generateDynamicSchema, validateSettingDefinitions } from '../src/generate';
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
  // Test for valid setting configurations
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
        optionType: 'model',
      },
      {
        key: 'fontSize',
        component: 'slider',
        type: 'number',
        range: { min: 8, max: 36 },
        default: 14,
        columnSpan: 2,
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
      },
    ];

    expect(() => validateSettingDefinitions(settingsWithColumnAdjustment)).not.toThrow();
  });

  // Test for label defaulting to key if not provided
  test('label should default to key if not explicitly set', () => {
    const settingsWithDefaultLabel: SettingsConfiguration = [
      { key: 'fontWeight', component: 'dropdown', type: 'string', options: ['normal', 'bold'] },
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
      { key: 'enableFeatureX', type: 'boolean', component: 'switch' }, // Missing default, should default to false
    ];

    validateSettingDefinitions(settings); // This would populate default values where missing

    expect(settings[0].default).toBe(false); // Expects default to be false for boolean without explicit default
  });

  // Validate that number slider without default uses middle of range
  test('number slider without default uses middle of range', () => {
    const settings: SettingsConfiguration = [
      { key: 'brightness', type: 'number', component: 'slider', range: { min: 0, max: 100 } }, // Missing default
    ];

    validateSettingDefinitions(settings); // This would populate default values where missing

    expect(settings[0].default).toBe(50); // Expects default to be midpoint of range
  });
});
