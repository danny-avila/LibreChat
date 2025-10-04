import { EModelEndpoint } from 'librechat-data-provider';
import { getPresetTitle, removeUnavailableTools } from '../presets';
import type { TPreset, TPlugin } from 'librechat-data-provider';

describe('presets utils', () => {
  describe('getPresetTitle', () => {
    const basePreset: TPreset = {
      presetId: 'test-id',
      title: 'Test Preset',
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4',
    };

    describe('with modelLabel', () => {
      it('should use modelLabel as the label', () => {
        const preset = {
          ...basePreset,
          modelLabel: 'Custom Model Name',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('Test Preset: gpt-4 (Custom Model Name)');
      });

      it('should prioritize modelLabel over deprecated chatGptLabel', () => {
        const preset = {
          ...basePreset,
          modelLabel: 'New Model Label',
          chatGptLabel: 'Old ChatGPT Label',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('Test Preset: gpt-4 (New Model Label)');
      });

      it('should handle title that includes the label', () => {
        const preset = {
          ...basePreset,
          title: 'Custom Model Name Settings',
          modelLabel: 'Custom Model Name',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('Custom Model Name Settings: gpt-4 (Custom Model Name)');
      });

      it('should handle case-insensitive title matching', () => {
        const preset = {
          ...basePreset,
          title: 'custom model name preset',
          modelLabel: 'Custom Model Name',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('custom model name preset: gpt-4 (Custom Model Name)');
      });

      it('should use label as title when label includes the title', () => {
        const preset = {
          ...basePreset,
          title: 'GPT',
          modelLabel: 'Custom GPT Assistant',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('Custom GPT Assistant: gpt-4');
      });
    });

    describe('without modelLabel', () => {
      it('should work without modelLabel', () => {
        const preset = { ...basePreset };

        const result = getPresetTitle(preset);

        expect(result).toBe('Test Preset: gpt-4');
      });

      it('should handle empty modelLabel', () => {
        const preset = {
          ...basePreset,
          modelLabel: '',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('Test Preset: gpt-4');
      });

      it('should handle null modelLabel', () => {
        const preset = {
          ...basePreset,
          modelLabel: null,
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('Test Preset: gpt-4');
      });
    });

    describe('title variations', () => {
      it('should handle missing title', () => {
        const preset = {
          ...basePreset,
          title: null,
          modelLabel: 'Custom Model',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('gpt-4 (Custom Model)');
      });

      it('should handle empty title', () => {
        const preset = {
          ...basePreset,
          title: '',
          modelLabel: 'Custom Model',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('gpt-4 (Custom Model)');
      });

      it('should handle "New Chat" title', () => {
        const preset = {
          ...basePreset,
          title: 'New Chat',
          modelLabel: 'Custom Model',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('gpt-4 (Custom Model)');
      });

      it('should handle title with whitespace', () => {
        const preset = {
          ...basePreset,
          title: '   ',
          modelLabel: 'Custom Model',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe(': gpt-4 (Custom Model)');
      });
    });

    describe('mention mode', () => {
      it('should return mention format with all components', () => {
        const preset = {
          ...basePreset,
          modelLabel: 'Custom Model',
          promptPrefix: 'You are a helpful assistant',
          tools: ['plugin1', 'plugin2'] as string[],
        };

        const result = getPresetTitle(preset, true);

        expect(result).toBe(
          'gpt-4 | Custom Model | You are a helpful assistant | plugin1, plugin2',
        );
      });

      it('should handle mention format with object tools', () => {
        const preset = {
          ...basePreset,
          modelLabel: 'Custom Model',
          tools: [
            { pluginKey: 'plugin1', name: 'Plugin 1' } as TPlugin,
            { pluginKey: 'plugin3', name: 'Plugin 3' } as TPlugin,
          ] as TPlugin[],
        };

        const result = getPresetTitle(preset, true);

        expect(result).toBe('gpt-4 | Custom Model | plugin1, plugin3');
      });

      it('should handle mention format with minimal data', () => {
        const preset = { ...basePreset };

        const result = getPresetTitle(preset, true);

        expect(result).toBe('gpt-4');
      });

      it('should handle mention format with only modelLabel', () => {
        const preset = {
          ...basePreset,
          modelLabel: 'Custom Model',
        };

        const result = getPresetTitle(preset, true);

        expect(result).toBe('gpt-4 | Custom Model');
      });

      it('should handle mention format with only promptPrefix', () => {
        const preset = {
          ...basePreset,
          promptPrefix: 'Custom prompt',
        };

        const result = getPresetTitle(preset, true);

        expect(result).toBe('gpt-4 | Custom prompt');
      });
    });

    describe('edge cases', () => {
      it('should handle missing model', () => {
        const preset = {
          ...basePreset,
          model: null,
          modelLabel: 'Custom Model',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('Test Preset:  (Custom Model)');
      });

      it('should handle undefined model', () => {
        const preset = {
          ...basePreset,
          model: undefined,
          modelLabel: 'Custom Model',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('Test Preset:  (Custom Model)');
      });

      it('should trim the final result', () => {
        const preset = {
          ...basePreset,
          title: '',
          model: '',
          modelLabel: '',
        };

        const result = getPresetTitle(preset);

        expect(result).toBe('');
      });
    });
  });

  describe('removeUnavailableTools', () => {
    const basePreset: TPreset = {
      presetId: 'test-id',
      title: 'Test Preset',
      endpoint: EModelEndpoint.openAI,
      model: 'gpt-4',
    };

    const availableTools: Record<string, TPlugin | undefined> = {
      plugin1: { pluginKey: 'plugin1', name: 'Plugin 1' } as TPlugin,
      plugin2: { pluginKey: 'plugin2', name: 'Plugin 2' } as TPlugin,
      plugin3: { pluginKey: 'plugin3', name: 'Plugin 3' } as TPlugin,
    };

    it('should remove unavailable tools from string array', () => {
      const preset = {
        ...basePreset,
        tools: ['plugin1', 'unavailable-plugin', 'plugin2'] as string[],
      };

      const result = removeUnavailableTools(preset, availableTools);

      expect(result.tools).toEqual(['plugin1', 'plugin2']);
    });

    it('should remove unavailable tools from object array', () => {
      const preset = {
        ...basePreset,
        tools: [
          { pluginKey: 'plugin1', name: 'Plugin 1' } as TPlugin,
          { pluginKey: 'unavailable-plugin', name: 'Unavailable' } as TPlugin,
          { pluginKey: 'plugin2', name: 'Plugin 2' } as TPlugin,
        ] as TPlugin[],
      };

      const result = removeUnavailableTools(preset, availableTools);

      expect(result.tools).toEqual(['plugin1', 'plugin2']);
    });

    it('should handle preset without tools', () => {
      const preset = { ...basePreset };

      const result = removeUnavailableTools(preset, availableTools);

      expect(result).toEqual(preset);
    });

    it('should handle preset with empty tools array', () => {
      const preset = {
        ...basePreset,
        tools: [] as string[],
      };

      const result = removeUnavailableTools(preset, availableTools);

      expect(result.tools).toEqual([]);
    });

    it('should remove all tools when none are available', () => {
      const preset = {
        ...basePreset,
        tools: ['unavailable1', 'unavailable2'] as string[],
      };

      const result = removeUnavailableTools(preset, {});

      expect(result.tools).toEqual([]);
    });

    it('should preserve all other preset properties', () => {
      const preset = {
        ...basePreset,
        tools: ['plugin1'] as string[],
        modelLabel: 'Custom Model',
        temperature: 0.8,
        promptPrefix: 'Test prompt',
      };

      const result = removeUnavailableTools(preset, availableTools);

      expect(result.presetId).toBe(preset.presetId);
      expect(result.title).toBe(preset.title);
      expect(result.endpoint).toBe(preset.endpoint);
      expect(result.model).toBe(preset.model);
      expect(result.modelLabel).toBe(preset.modelLabel);
      expect(result.temperature).toBe(preset.temperature);
      expect(result.promptPrefix).toBe(preset.promptPrefix);
      expect(result.tools).toEqual(['plugin1']);
    });

    it('should not mutate the original preset', () => {
      const preset = {
        ...basePreset,
        tools: ['plugin1', 'unavailable-plugin'] as string[],
      };
      const originalTools = [...preset.tools];

      removeUnavailableTools(preset, availableTools);

      expect(preset.tools).toEqual(originalTools);
    });
  });
});
