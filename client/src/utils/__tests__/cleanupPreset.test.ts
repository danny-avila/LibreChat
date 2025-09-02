import { EModelEndpoint } from 'librechat-data-provider';
import cleanupPreset from '../cleanupPreset';
import type { TPreset } from 'librechat-data-provider';

// Mock parseConvo since we're focusing on testing the chatGptLabel migration logic
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  parseConvo: jest.fn((input) => {
    // Return a simplified mock that passes through most properties
    const { conversation } = input;
    return {
      ...conversation,
      model: conversation?.model || 'gpt-3.5-turbo',
    };
  }),
}));

describe('cleanupPreset', () => {
  const basePreset = {
    presetId: 'test-preset-id',
    title: 'Test Preset',
    endpoint: EModelEndpoint.openAI,
    model: 'gpt-4',
    temperature: 0.7,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('chatGptLabel migration', () => {
    it('should migrate chatGptLabel to modelLabel when only chatGptLabel exists', () => {
      const preset = {
        ...basePreset,
        chatGptLabel: 'Custom ChatGPT Label',
      };

      const result = cleanupPreset({ preset });

      expect(result.modelLabel).toBe('Custom ChatGPT Label');
      expect(result.chatGptLabel).toBeUndefined();
    });

    it('should prioritize modelLabel over chatGptLabel when both exist', () => {
      const preset = {
        ...basePreset,
        chatGptLabel: 'Old ChatGPT Label',
        modelLabel: 'New Model Label',
      };

      const result = cleanupPreset({ preset });

      expect(result.modelLabel).toBe('New Model Label');
      expect(result.chatGptLabel).toBeUndefined();
    });

    it('should keep modelLabel when only modelLabel exists', () => {
      const preset = {
        ...basePreset,
        modelLabel: 'Existing Model Label',
      };

      const result = cleanupPreset({ preset });

      expect(result.modelLabel).toBe('Existing Model Label');
      expect(result.chatGptLabel).toBeUndefined();
    });

    it('should handle preset without either label', () => {
      const preset = { ...basePreset };

      const result = cleanupPreset({ preset });

      expect(result.modelLabel).toBeUndefined();
      expect(result.chatGptLabel).toBeUndefined();
    });

    it('should handle empty chatGptLabel', () => {
      const preset = {
        ...basePreset,
        chatGptLabel: '',
        modelLabel: 'Valid Model Label',
      };

      const result = cleanupPreset({ preset });

      expect(result.modelLabel).toBe('Valid Model Label');
      expect(result.chatGptLabel).toBeUndefined();
    });

    it('should not migrate empty string chatGptLabel when modelLabel exists', () => {
      const preset = {
        ...basePreset,
        chatGptLabel: '',
      };

      const result = cleanupPreset({ preset });

      expect(result.modelLabel).toBeUndefined();
      expect(result.chatGptLabel).toBeUndefined();
    });
  });

  describe('presetOverride handling', () => {
    it('should apply presetOverride and then handle label migration', () => {
      const preset = {
        ...basePreset,
        chatGptLabel: 'Original Label',
        presetOverride: {
          modelLabel: 'Override Model Label',
          temperature: 0.9,
        },
      };

      const result = cleanupPreset({ preset });

      expect(result.modelLabel).toBe('Override Model Label');
      expect(result.chatGptLabel).toBeUndefined();
      expect(result.temperature).toBe(0.9);
    });

    it('should handle label migration in presetOverride', () => {
      const preset = {
        ...basePreset,
        presetOverride: {
          chatGptLabel: 'Override ChatGPT Label',
        },
      };

      const result = cleanupPreset({ preset });

      expect(result.modelLabel).toBe('Override ChatGPT Label');
      expect(result.chatGptLabel).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should handle undefined preset', () => {
      const result = cleanupPreset({ preset: undefined });

      expect(result).toEqual({
        endpoint: null,
        presetId: null,
        title: 'New Preset',
      });
    });

    it('should handle preset with null endpoint', () => {
      const preset = {
        ...basePreset,
        endpoint: null,
      };

      const result = cleanupPreset({ preset });

      expect(result).toEqual({
        endpoint: null,
        presetId: 'test-preset-id',
        title: 'Test Preset',
      });
    });

    it('should handle preset with empty string endpoint', () => {
      const preset = {
        ...basePreset,
        endpoint: '',
      };

      const result = cleanupPreset({ preset });

      expect(result).toEqual({
        endpoint: null,
        presetId: 'test-preset-id',
        title: 'Test Preset',
      });
    });
  });

  describe('normal preset properties', () => {
    it('should preserve all other preset properties', () => {
      const preset = {
        ...basePreset,
        promptPrefix: 'Custom prompt:',
        temperature: 0.8,
        top_p: 0.9,
        modelLabel: 'Custom Model',
        tools: ['plugin1', 'plugin2'],
      };

      const result = cleanupPreset({ preset });

      expect(result.presetId).toBe('test-preset-id');
      expect(result.title).toBe('Test Preset');
      expect(result.endpoint).toBe(EModelEndpoint.openAI);
      expect(result.modelLabel).toBe('Custom Model');
      expect(result.promptPrefix).toBe('Custom prompt:');
      expect(result.temperature).toBe(0.8);
      expect(result.top_p).toBe(0.9);
      expect(result.tools).toEqual(['plugin1', 'plugin2']);
    });

    it('should generate default title when title is missing', () => {
      const preset = {
        ...basePreset,
        title: undefined,
      };

      const result = cleanupPreset({ preset });

      expect(result.title).toBe('New Preset');
    });

    it('should handle null presetId', () => {
      const preset = {
        ...basePreset,
        presetId: null,
      };

      const result = cleanupPreset({ preset });

      expect(result.presetId).toBeNull();
    });
  });
});
