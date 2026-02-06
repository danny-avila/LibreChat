import { bedrockInputParser, bedrockOutputParser } from '../src/bedrock';

describe('bedrockInputParser', () => {
  describe('Model Matching for Reasoning Configuration', () => {
    test('should match anthropic.claude-3-7-sonnet model', () => {
      const input = {
        model: 'anthropic.claude-3-7-sonnet',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-sonnet-4 model with 1M context header', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should match anthropic.claude-opus-5 model with adaptive thinking and 1M context', () => {
      const input = {
        model: 'anthropic.claude-opus-5',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toEqual({ type: 'adaptive' });
      expect(additionalFields.thinkingBudget).toBeUndefined();
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should match anthropic.claude-haiku-6 model without 1M context header', () => {
      const input = {
        model: 'anthropic.claude-haiku-6',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-4-sonnet model with 1M context header', () => {
      const input = {
        model: 'anthropic.claude-4-sonnet',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should match anthropic.claude-4.5-sonnet model with 1M context header', () => {
      const input = {
        model: 'anthropic.claude-4.5-sonnet',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should match anthropic.claude-4-7-sonnet model with 1M context header', () => {
      const input = {
        model: 'anthropic.claude-4-7-sonnet',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should match anthropic.claude-sonnet-4-20250514-v1:0 with full model ID', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4-20250514-v1:0',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should not match non-Claude models', () => {
      const input = {
        model: 'some-other-model',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      expect(result.additionalModelRequestFields).toBeUndefined();
    });

    test('should not add anthropic_beta to Moonshot Kimi K2 models', () => {
      const input = {
        model: 'moonshot.kimi-k2-0711-thinking',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as
        | Record<string, unknown>
        | undefined;
      expect(additionalFields?.anthropic_beta).toBeUndefined();
    });

    test('should not add anthropic_beta to DeepSeek models', () => {
      const input = {
        model: 'deepseek.deepseek-r1',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as
        | Record<string, unknown>
        | undefined;
      expect(additionalFields?.anthropic_beta).toBeUndefined();
    });

    test('should respect explicit thinking configuration but still add beta headers', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4',
        thinking: false,
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBeUndefined();
      expect(additionalFields.thinkingBudget).toBeUndefined();
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should respect custom thinking budget', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4',
        thinking: true,
        thinkingBudget: 3000,
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(3000);
    });
  });

  describe('Opus 4.6 Adaptive Thinking', () => {
    test('should default to adaptive thinking for anthropic.claude-opus-4-6-v1', () => {
      const input = {
        model: 'anthropic.claude-opus-4-6-v1',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toEqual({ type: 'adaptive' });
      expect(additionalFields.thinkingBudget).toBeUndefined();
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should handle cross-region model ID us.anthropic.claude-opus-4-6-v1', () => {
      const input = {
        model: 'us.anthropic.claude-opus-4-6-v1',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toEqual({ type: 'adaptive' });
      expect(additionalFields.thinkingBudget).toBeUndefined();
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should handle cross-region model ID global.anthropic.claude-opus-4-6-v1', () => {
      const input = {
        model: 'global.anthropic.claude-opus-4-6-v1',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toEqual({ type: 'adaptive' });
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should pass effort parameter via output_config for adaptive models', () => {
      const input = {
        model: 'anthropic.claude-opus-4-6-v1',
        effort: 'medium',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toEqual({ type: 'adaptive' });
      expect(additionalFields.output_config).toEqual({ effort: 'medium' });
      expect(additionalFields.effort).toBeUndefined();
    });

    test('should not include output_config when effort is unset (empty string)', () => {
      const input = {
        model: 'anthropic.claude-opus-4-6-v1',
        effort: '',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toEqual({ type: 'adaptive' });
      expect(additionalFields.output_config).toBeUndefined();
    });

    test('should respect thinking=false for adaptive models', () => {
      const input = {
        model: 'anthropic.claude-opus-4-6-v1',
        thinking: false,
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBeUndefined();
      expect(additionalFields.thinkingBudget).toBeUndefined();
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should strip effort for non-adaptive thinking models', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
        effort: 'high',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.effort).toBeUndefined();
      expect(additionalFields.output_config).toBeUndefined();
    });

    test('should not include effort for Opus 4.5 (non-adaptive)', () => {
      const input = {
        model: 'anthropic.claude-opus-4-5-v1:0',
        effort: 'low',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.effort).toBeUndefined();
      expect(additionalFields.output_config).toBeUndefined();
    });

    test('should support max effort for Opus 4.6', () => {
      const input = {
        model: 'anthropic.claude-opus-4-6-v1',
        effort: 'max',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toEqual({ type: 'adaptive' });
      expect(additionalFields.output_config).toEqual({ effort: 'max' });
    });
  });

  describe('bedrockOutputParser with configureThinking', () => {
    test('should preserve adaptive thinking config and set default maxTokens', () => {
      const parsed = bedrockInputParser.parse({
        model: 'anthropic.claude-opus-4-6-v1',
      }) as Record<string, unknown>;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      const amrf = output.additionalModelRequestFields as Record<string, unknown>;
      expect(amrf.thinking).toEqual({ type: 'adaptive' });
      expect(output.maxTokens).toBe(16000);
      expect(output.maxOutputTokens).toBeUndefined();
    });

    test('should respect user-provided maxTokens for adaptive model', () => {
      const parsed = bedrockInputParser.parse({
        model: 'anthropic.claude-opus-4-6-v1',
        maxTokens: 32000,
      }) as Record<string, unknown>;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      expect(output.maxTokens).toBe(32000);
    });

    test('should convert thinking=true to enabled config for non-adaptive models', () => {
      const parsed = bedrockInputParser.parse({
        model: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      }) as Record<string, unknown>;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      const amrf = output.additionalModelRequestFields as Record<string, unknown>;
      expect(amrf.thinking).toEqual({ type: 'enabled', budget_tokens: 2000 });
      expect(output.maxTokens).toBe(8192);
    });

    test('should pass output_config through for adaptive model with effort', () => {
      const parsed = bedrockInputParser.parse({
        model: 'anthropic.claude-opus-4-6-v1',
        effort: 'low',
      }) as Record<string, unknown>;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      const amrf = output.additionalModelRequestFields as Record<string, unknown>;
      expect(amrf.thinking).toEqual({ type: 'adaptive' });
      expect(amrf.output_config).toEqual({ effort: 'low' });
    });

    test('should remove additionalModelRequestFields when thinking disabled and no other fields', () => {
      const parsed = bedrockInputParser.parse({
        model: 'some-other-model',
      }) as Record<string, unknown>;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      expect(output.additionalModelRequestFields).toBeUndefined();
    });
  });
});
