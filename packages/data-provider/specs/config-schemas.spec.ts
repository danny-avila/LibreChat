import {
  endpointSchema,
  paramDefinitionSchema,
  agentsEndpointSchema,
  azureEndpointSchema,
} from '../src/config';
import { tModelSpecPresetSchema, EModelEndpoint } from '../src/schemas';

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
});
