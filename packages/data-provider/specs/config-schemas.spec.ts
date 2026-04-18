import {
  paramDefinitionSchema,
  agentsEndpointSchema,
  azureEndpointSchema,
  endpointSchema,
  configSchema,
  interfaceSchema,
  fileStorageSchema,
  fileStrategiesSchema,
  summarizationTriggerSchema,
  summarizationConfigSchema,
} from '../src/config';
import { tModelSpecPresetSchema, EModelEndpoint } from '../src/schemas';
import { FileSources } from '../src/types/files';

describe('paramDefinitionSchema', () => {
  it('accepts a minimal definition with only key', () => {
    const result = paramDefinitionSchema.safeParse({ key: 'temperature' });
    expect(result.success).toBe(true);
  });

  it('accepts a full definition with all fields', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'temperature',
      type: 'number',
      component: 'slider',
      default: 0.7,
      label: 'Temperature',
      range: { min: 0, max: 2, step: 0.01 },
      columns: 2,
      columnSpan: 1,
      includeInput: true,
      descriptionSide: 'right',
    });
    expect(result.success).toBe(true);
  });

  it('rejects columns > 4', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'test',
      columns: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects columns < 1', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'test',
      columns: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer columns', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'test',
      columns: 2.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer columnSpan', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'test',
      columnSpan: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative minTags', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'test',
      minTags: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid descriptionSide', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'test',
      descriptionSide: 'diagonal',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type enum value', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'test',
      type: 'invalid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid component enum value', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'test',
      component: 'wheel',
    });
    expect(result.success).toBe(false);
  });

  it('allows type and component to be omitted (merged from defaults at runtime)', () => {
    const result = paramDefinitionSchema.safeParse({
      key: 'temperature',
      range: { min: 0, max: 2, step: 0.01 },
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('type');
    expect(result.data).not.toHaveProperty('component');
  });
});

describe('tModelSpecPresetSchema', () => {
  it('strips system/DB fields from preset', () => {
    const result = tModelSpecPresetSchema.safeParse({
      conversationId: 'conv-123',
      presetId: 'preset-456',
      title: 'My Preset',
      defaultPreset: true,
      order: 3,
      isArchived: true,
      user: 'user123',
      messages: ['msg1'],
      tags: ['tag1'],
      file_ids: ['file1'],
      expiredAt: '2026-12-31',
      parentMessageId: 'parent1',
      model: 'gpt-4o',
      endpoint: EModelEndpoint.openAI,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('conversationId');
      expect(result.data).not.toHaveProperty('presetId');
      expect(result.data).not.toHaveProperty('title');
      expect(result.data).not.toHaveProperty('defaultPreset');
      expect(result.data).not.toHaveProperty('order');
      expect(result.data).not.toHaveProperty('isArchived');
      expect(result.data).not.toHaveProperty('user');
      expect(result.data).not.toHaveProperty('messages');
      expect(result.data).not.toHaveProperty('tags');
      expect(result.data).not.toHaveProperty('file_ids');
      expect(result.data).not.toHaveProperty('expiredAt');
      expect(result.data).not.toHaveProperty('parentMessageId');
      expect(result.data).toHaveProperty('model', 'gpt-4o');
    }
  });

  it('strips deprecated fields', () => {
    const result = tModelSpecPresetSchema.safeParse({
      resendImages: true,
      chatGptLabel: 'old-label',
      model: 'gpt-4o',
      endpoint: EModelEndpoint.openAI,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('resendImages');
      expect(result.data).not.toHaveProperty('chatGptLabel');
    }
  });

  it('strips frontend-only fields', () => {
    const result = tModelSpecPresetSchema.safeParse({
      greeting: 'Hello!',
      iconURL: 'https://example.com/icon.png',
      spec: 'some-spec',
      presetOverride: { model: 'other' },
      model: 'gpt-4o',
      endpoint: EModelEndpoint.openAI,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('greeting');
      expect(result.data).not.toHaveProperty('iconURL');
      expect(result.data).not.toHaveProperty('spec');
      expect(result.data).not.toHaveProperty('presetOverride');
    }
  });

  it('preserves valid preset fields', () => {
    const result = tModelSpecPresetSchema.safeParse({
      model: 'gpt-4o',
      endpoint: EModelEndpoint.openAI,
      temperature: 0.7,
      topP: 0.9,
      maxOutputTokens: 4096,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe('gpt-4o');
      expect(result.data.temperature).toBe(0.7);
      expect(result.data.topP).toBe(0.9);
      expect(result.data.maxOutputTokens).toBe(4096);
    }
  });
});

describe('endpointSchema deprecated fields', () => {
  const validEndpoint = {
    name: 'CustomEndpoint',
    apiKey: 'test-key',
    baseURL: 'https://api.example.com',
    models: { default: ['model-1'] },
  };

  it('silently strips deprecated summarize field', () => {
    const result = endpointSchema.safeParse({
      ...validEndpoint,
      summarize: true,
      summaryModel: 'gpt-4o',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('summarize');
      expect(result.data).not.toHaveProperty('summaryModel');
    }
  });

  it('silently strips deprecated customOrder field', () => {
    const result = endpointSchema.safeParse({
      ...validEndpoint,
      customOrder: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('customOrder');
    }
  });
});

describe('endpointSchema addParams validation', () => {
  const validEndpoint = {
    name: 'CustomEndpoint',
    apiKey: 'test-key',
    baseURL: 'https://api.example.com',
    models: { default: ['model-1'] },
  };
  const nestedAddParams = {
    provider: {
      only: ['z-ai'],
      quantizations: ['int4'],
    },
  };

  it('accepts nested addParams objects and arrays', () => {
    const result = endpointSchema.safeParse({
      ...validEndpoint,
      addParams: nestedAddParams,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.addParams).toEqual(nestedAddParams);
    }
  });

  it('keeps configSchema validation intact with nested custom addParams', () => {
    const result = configSchema.safeParse({
      version: '1.0.0',
      endpoints: {
        custom: [
          {
            ...validEndpoint,
            addParams: nestedAddParams,
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts boolean web_search in addParams', () => {
    const result = endpointSchema.safeParse({
      ...validEndpoint,
      addParams: {
        provider: {
          only: ['z-ai'],
        },
        web_search: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts scalar addParams values', () => {
    const result = endpointSchema.safeParse({
      ...validEndpoint,
      addParams: {
        model: 'custom-model',
        retries: 2,
        metadata: null,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean web_search objects in addParams', () => {
    const result = endpointSchema.safeParse({
      ...validEndpoint,
      addParams: {
        provider: {
          only: ['z-ai'],
        },
        web_search: {
          enabled: true,
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects configSchema entries with non-boolean web_search objects in custom addParams', () => {
    const result = configSchema.safeParse({
      version: '1.0.0',
      endpoints: {
        custom: [
          {
            ...validEndpoint,
            addParams: {
              provider: {
                only: ['z-ai'],
              },
              web_search: {
                enabled: true,
              },
            },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('agentsEndpointSchema', () => {
  it('does not accept baseURL', () => {
    const result = agentsEndpointSchema.safeParse({
      baseURL: 'https://example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('baseURL');
    }
  });
});

describe('azureEndpointSchema', () => {
  it('silently strips plugins field', () => {
    const result = azureEndpointSchema.safeParse({
      groups: [
        {
          group: 'test-group',
          apiKey: 'test-key',
          models: { 'gpt-4': true },
        },
      ],
      plugins: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('plugins');
    }
  });

  it('accepts nested addParams in azure groups', () => {
    const result = azureEndpointSchema.safeParse({
      groups: [
        {
          group: 'test-group',
          apiKey: 'test-key',
          models: { 'gpt-4': true },
          addParams: {
            provider: {
              only: ['z-ai'],
            },
          },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.groups[0].addParams).toEqual({
        provider: {
          only: ['z-ai'],
        },
      });
    }
  });

  it('accepts boolean web_search in azure addParams', () => {
    const result = azureEndpointSchema.safeParse({
      groups: [
        {
          group: 'test-group',
          apiKey: 'test-key',
          models: { 'gpt-4': true },
          addParams: {
            provider: {
              only: ['z-ai'],
            },
            web_search: false,
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean web_search objects in azure addParams', () => {
    const result = azureEndpointSchema.safeParse({
      groups: [
        {
          group: 'test-group',
          apiKey: 'test-key',
          models: { 'gpt-4': true },
          addParams: {
            provider: {
              only: ['z-ai'],
            },
            web_search: {
              enabled: true,
            },
          },
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('fileStorageSchema', () => {
  const validStrategies = [
    FileSources.local,
    FileSources.firebase,
    FileSources.s3,
    FileSources.azure_blob,
  ];
  const invalidStrategies = [
    FileSources.openai,
    FileSources.azure,
    FileSources.vectordb,
    FileSources.execute_code,
    FileSources.mistral_ocr,
    FileSources.azure_mistral_ocr,
    FileSources.vertexai_mistral_ocr,
    FileSources.text,
    FileSources.document_parser,
  ];

  for (const strategy of validStrategies) {
    it(`accepts storage strategy "${strategy}"`, () => {
      expect(fileStorageSchema.safeParse(strategy).success).toBe(true);
    });
  }

  for (const strategy of invalidStrategies) {
    it(`rejects processing strategy "${strategy}"`, () => {
      expect(fileStorageSchema.safeParse(strategy).success).toBe(false);
    });
  }
});

describe('fileStrategiesSchema', () => {
  it('accepts valid storage strategies for all sub-fields', () => {
    const result = fileStrategiesSchema.safeParse({
      default: FileSources.s3,
      avatar: FileSources.local,
      image: FileSources.firebase,
      document: FileSources.azure_blob,
    });
    expect(result.success).toBe(true);
  });

  it('rejects processing strategies in sub-fields', () => {
    const result = fileStrategiesSchema.safeParse({
      default: FileSources.vectordb,
    });
    expect(result.success).toBe(false);
  });
});

describe('configSchema fileStrategy', () => {
  it('rejects a processing strategy as fileStrategy', () => {
    const result = configSchema.safeParse({ version: '1.3.7', fileStrategy: FileSources.vectordb });
    expect(result.success).toBe(false);
  });

  it('defaults fileStrategy to local when absent', () => {
    const result = configSchema.safeParse({ version: '1.3.7' });
    expect(result.success).toBe(true);
    expect(result.data?.fileStrategy).toBe(FileSources.local);
  });
});

describe('interfaceSchema', () => {
  it('silently strips removed legacy fields', () => {
    const result = interfaceSchema.parse({
      endpointsMenu: true,
      sidePanel: true,
      modelSelect: false,
    });
    expect(result).not.toHaveProperty('endpointsMenu');
    expect(result).not.toHaveProperty('sidePanel');
    expect(result.modelSelect).toBe(false);
  });
});

describe('summarizationTriggerSchema', () => {
  it.each([
    ['token_ratio', 0.8],
    ['remaining_tokens', 500],
    ['messages_to_refine', 4],
  ] as const)('accepts documented trigger type "%s" with a sensible value', (type, value) => {
    const result = summarizationTriggerSchema.safeParse({ type, value });
    expect(result.success).toBe(true);
  });

  it('rejects the legacy/typoed "token_count" trigger type', () => {
    const result = summarizationTriggerSchema.safeParse({
      type: 'token_count',
      value: 8000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown trigger types', () => {
    const result = summarizationTriggerSchema.safeParse({
      type: 'never_heard_of_it',
      value: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative values on any trigger type', () => {
    expect(summarizationTriggerSchema.safeParse({ type: 'token_ratio', value: -0.5 }).success).toBe(
      false,
    );
    expect(
      summarizationTriggerSchema.safeParse({ type: 'remaining_tokens', value: -1 }).success,
    ).toBe(false);
    expect(
      summarizationTriggerSchema.safeParse({ type: 'messages_to_refine', value: -1 }).success,
    ).toBe(false);
  });

  it('rejects zero for count-based triggers where it has no meaningful effect', () => {
    expect(
      summarizationTriggerSchema.safeParse({ type: 'remaining_tokens', value: 0 }).success,
    ).toBe(false);
    expect(
      summarizationTriggerSchema.safeParse({ type: 'messages_to_refine', value: 0 }).success,
    ).toBe(false);
  });

  it('rejects token_ratio values > 1 to catch the "80 meant as 80%" mistake', () => {
    expect(summarizationTriggerSchema.safeParse({ type: 'token_ratio', value: 80 }).success).toBe(
      false,
    );
    expect(summarizationTriggerSchema.safeParse({ type: 'token_ratio', value: 1.01 }).success).toBe(
      false,
    );
  });

  it('accepts token_ratio values at the inclusive 0 and 1 bounds per docs', () => {
    expect(summarizationTriggerSchema.safeParse({ type: 'token_ratio', value: 0 }).success).toBe(
      true,
    );
    expect(summarizationTriggerSchema.safeParse({ type: 'token_ratio', value: 1 }).success).toBe(
      true,
    );
  });

  it('allows remaining_tokens and messages_to_refine values above 1 (token/message counts)', () => {
    expect(
      summarizationTriggerSchema.safeParse({ type: 'remaining_tokens', value: 2000 }).success,
    ).toBe(true);
    expect(
      summarizationTriggerSchema.safeParse({ type: 'messages_to_refine', value: 20 }).success,
    ).toBe(true);
  });

  it('rejects non-finite values (Infinity, NaN) for every trigger type', () => {
    for (const type of ['token_ratio', 'remaining_tokens', 'messages_to_refine'] as const) {
      expect(summarizationTriggerSchema.safeParse({ type, value: Infinity }).success).toBe(false);
      expect(summarizationTriggerSchema.safeParse({ type, value: -Infinity }).success).toBe(false);
      expect(summarizationTriggerSchema.safeParse({ type, value: NaN }).success).toBe(false);
    }
  });

  it('requires integer values for count-based triggers', () => {
    expect(
      summarizationTriggerSchema.safeParse({ type: 'remaining_tokens', value: 500.5 }).success,
    ).toBe(false);
    expect(
      summarizationTriggerSchema.safeParse({ type: 'messages_to_refine', value: 2.5 }).success,
    ).toBe(false);
  });

  it('still allows fractional values for token_ratio', () => {
    expect(summarizationTriggerSchema.safeParse({ type: 'token_ratio', value: 0.8 }).success).toBe(
      true,
    );
  });

  it('parses inside the full summarization config', () => {
    const result = summarizationConfigSchema.safeParse({
      enabled: true,
      trigger: { type: 'token_ratio', value: 0.8 },
    });
    expect(result.success).toBe(true);
  });
});
