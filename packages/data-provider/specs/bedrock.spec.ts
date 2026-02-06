import {
  supportsAdaptiveThinking,
  bedrockOutputParser,
  bedrockInputParser,
  supportsContext1m,
} from '../src/bedrock';

describe('supportsAdaptiveThinking', () => {
  test('should return true for claude-opus-4-6', () => {
    expect(supportsAdaptiveThinking('claude-opus-4-6')).toBe(true);
  });

  test('should return true for claude-opus-4.6', () => {
    expect(supportsAdaptiveThinking('claude-opus-4.6')).toBe(true);
  });

  test('should return true for claude-opus-4-7 (future)', () => {
    expect(supportsAdaptiveThinking('claude-opus-4-7')).toBe(true);
  });

  test('should return true for claude-opus-5 (future)', () => {
    expect(supportsAdaptiveThinking('claude-opus-5')).toBe(true);
  });

  test('should return true for claude-opus-9 (future)', () => {
    expect(supportsAdaptiveThinking('claude-opus-9')).toBe(true);
  });

  test('should return true for claude-sonnet-5 (future)', () => {
    expect(supportsAdaptiveThinking('claude-sonnet-5')).toBe(true);
  });

  test('should return true for claude-sonnet-6 (future)', () => {
    expect(supportsAdaptiveThinking('claude-sonnet-6')).toBe(true);
  });

  test('should return false for claude-opus-4-5', () => {
    expect(supportsAdaptiveThinking('claude-opus-4-5')).toBe(false);
  });

  test('should return false for claude-opus-4', () => {
    expect(supportsAdaptiveThinking('claude-opus-4')).toBe(false);
  });

  test('should return false for claude-opus-4-0', () => {
    expect(supportsAdaptiveThinking('claude-opus-4-0')).toBe(false);
  });

  test('should return false for claude-sonnet-4-5', () => {
    expect(supportsAdaptiveThinking('claude-sonnet-4-5')).toBe(false);
  });

  test('should return false for claude-sonnet-4', () => {
    expect(supportsAdaptiveThinking('claude-sonnet-4')).toBe(false);
  });

  test('should return false for claude-3-7-sonnet', () => {
    expect(supportsAdaptiveThinking('claude-3-7-sonnet')).toBe(false);
  });

  test('should return false for unrelated model', () => {
    expect(supportsAdaptiveThinking('gpt-4o')).toBe(false);
  });

  test('should handle Bedrock model ID with prefix stripping', () => {
    expect(supportsAdaptiveThinking('anthropic.claude-opus-4-6-v1:0')).toBe(true);
  });

  test('should handle cross-region Bedrock model ID', () => {
    expect(supportsAdaptiveThinking('us.anthropic.claude-opus-4-6-v1')).toBe(true);
  });

  test('should return true for claude-4-6-opus (alternate naming)', () => {
    expect(supportsAdaptiveThinking('claude-4-6-opus')).toBe(true);
  });

  test('should return true for anthropic.claude-4-6-opus (alternate naming)', () => {
    expect(supportsAdaptiveThinking('anthropic.claude-4-6-opus')).toBe(true);
  });

  test('should return true for claude-5-sonnet (alternate naming)', () => {
    expect(supportsAdaptiveThinking('claude-5-sonnet')).toBe(true);
  });

  test('should return true for anthropic.claude-5-sonnet (alternate naming)', () => {
    expect(supportsAdaptiveThinking('anthropic.claude-5-sonnet')).toBe(true);
  });

  test('should return false for claude-4-5-opus (alternate naming, below threshold)', () => {
    expect(supportsAdaptiveThinking('claude-4-5-opus')).toBe(false);
  });

  test('should return false for claude-4-sonnet (alternate naming, below threshold)', () => {
    expect(supportsAdaptiveThinking('claude-4-sonnet')).toBe(false);
  });
});

describe('supportsContext1m', () => {
  test('should return true for claude-sonnet-4', () => {
    expect(supportsContext1m('claude-sonnet-4')).toBe(true);
  });

  test('should return true for claude-sonnet-4-5', () => {
    expect(supportsContext1m('claude-sonnet-4-5')).toBe(true);
  });

  test('should return true for claude-sonnet-5 (future)', () => {
    expect(supportsContext1m('claude-sonnet-5')).toBe(true);
  });

  test('should return true for claude-opus-4-6', () => {
    expect(supportsContext1m('claude-opus-4-6')).toBe(true);
  });

  test('should return true for claude-opus-5 (future)', () => {
    expect(supportsContext1m('claude-opus-5')).toBe(true);
  });

  test('should return false for claude-opus-4-5', () => {
    expect(supportsContext1m('claude-opus-4-5')).toBe(false);
  });

  test('should return false for claude-opus-4', () => {
    expect(supportsContext1m('claude-opus-4')).toBe(false);
  });

  test('should return false for claude-3-7-sonnet', () => {
    expect(supportsContext1m('claude-3-7-sonnet')).toBe(false);
  });

  test('should return false for claude-sonnet-3', () => {
    expect(supportsContext1m('claude-sonnet-3')).toBe(false);
  });

  test('should return false for unrelated model', () => {
    expect(supportsContext1m('gpt-4o')).toBe(false);
  });

  test('should return true for claude-4-sonnet (alternate naming)', () => {
    expect(supportsContext1m('claude-4-sonnet')).toBe(true);
  });

  test('should return true for claude-5-sonnet (alternate naming)', () => {
    expect(supportsContext1m('claude-5-sonnet')).toBe(true);
  });

  test('should return true for claude-4-6-opus (alternate naming)', () => {
    expect(supportsContext1m('claude-4-6-opus')).toBe(true);
  });

  test('should return false for claude-3-sonnet (alternate naming, below threshold)', () => {
    expect(supportsContext1m('claude-3-sonnet')).toBe(false);
  });

  test('should return false for claude-4-5-opus (alternate naming, below threshold)', () => {
    expect(supportsContext1m('claude-4-5-opus')).toBe(false);
  });
});

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

    test('should preserve effort when thinking=false for adaptive models', () => {
      const input = {
        model: 'anthropic.claude-opus-4-6-v1',
        thinking: false,
        effort: 'high',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBeUndefined();
      expect(additionalFields.thinkingBudget).toBeUndefined();
      expect(additionalFields.output_config).toEqual({ effort: 'high' });
      expect(additionalFields.effort).toBeUndefined();
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

    test('should use adaptive default maxTokens (16000) over maxOutputTokens for adaptive models', () => {
      const parsed = bedrockInputParser.parse({
        model: 'anthropic.claude-opus-4-6-v1',
      }) as Record<string, unknown>;
      parsed.maxOutputTokens = undefined;
      (parsed as Record<string, unknown>).maxTokens = undefined;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      expect(output.maxTokens).toBe(16000);
    });

    test('should use enabled default maxTokens (8192) for non-adaptive thinking models', () => {
      const parsed = bedrockInputParser.parse({
        model: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      }) as Record<string, unknown>;
      parsed.maxOutputTokens = undefined;
      (parsed as Record<string, unknown>).maxTokens = undefined;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      expect(output.maxTokens).toBe(8192);
    });

    test('should use default thinking budget (2000) when no custom budget is set', () => {
      const parsed = bedrockInputParser.parse({
        model: 'anthropic.claude-3-7-sonnet',
      }) as Record<string, unknown>;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      const amrf = output.additionalModelRequestFields as Record<string, unknown>;
      const thinking = amrf.thinking as { type: string; budget_tokens: number };
      expect(thinking.budget_tokens).toBe(2000);
    });

    test('should override default thinking budget with custom value', () => {
      const parsed = bedrockInputParser.parse({
        model: 'anthropic.claude-3-7-sonnet',
        thinkingBudget: 5000,
        maxTokens: 8192,
      }) as Record<string, unknown>;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      const amrf = output.additionalModelRequestFields as Record<string, unknown>;
      const thinking = amrf.thinking as { type: string; budget_tokens: number };
      expect(thinking.budget_tokens).toBe(5000);
    });

    test('should remove additionalModelRequestFields when thinking disabled and no other fields', () => {
      const parsed = bedrockInputParser.parse({
        model: 'some-other-model',
      }) as Record<string, unknown>;
      const output = bedrockOutputParser(parsed as Record<string, unknown>);
      expect(output.additionalModelRequestFields).toBeUndefined();
    });
  });

  describe('Model switching cleanup', () => {
    test('should strip anthropic_beta when switching from Anthropic to non-Anthropic model', () => {
      const staleConversationData = {
        model: 'openai.gpt-oss-120b-1:0',
        promptCache: true,
        additionalModelRequestFields: {
          anthropic_beta: ['output-128k-2025-02-19', 'context-1m-2025-08-07'],
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high' },
        },
      };
      const result = bedrockInputParser.parse(staleConversationData) as Record<string, unknown>;
      const amrf = result.additionalModelRequestFields as Record<string, unknown> | undefined;
      expect(amrf?.anthropic_beta).toBeUndefined();
      expect(amrf?.thinking).toBeUndefined();
      expect(amrf?.output_config).toBeUndefined();
      expect(result.promptCache).toBeUndefined();
    });

    test('should strip promptCache when switching from Claude to non-Claude/Nova model', () => {
      const staleConversationData = {
        model: 'deepseek.deepseek-r1',
        promptCache: true,
      };
      const result = bedrockInputParser.parse(staleConversationData) as Record<string, unknown>;
      expect(result.promptCache).toBeUndefined();
    });

    test('should preserve promptCache for Claude models', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4-20250514-v1:0',
        promptCache: true,
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      expect(result.promptCache).toBe(true);
    });

    test('should preserve promptCache for Nova models', () => {
      const input = {
        model: 'amazon.nova-pro-v1:0',
        promptCache: true,
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      expect(result.promptCache).toBe(true);
    });

    test('should strip stale thinking config from additionalModelRequestFields for non-Anthropic models', () => {
      const staleConversationData = {
        model: 'moonshot.kimi-k2-0711-thinking',
        additionalModelRequestFields: {
          thinking: { type: 'enabled', budget_tokens: 2000 },
          thinkingBudget: 2000,
          anthropic_beta: ['output-128k-2025-02-19'],
        },
      };
      const result = bedrockInputParser.parse(staleConversationData) as Record<string, unknown>;
      const amrf = result.additionalModelRequestFields as Record<string, unknown> | undefined;
      expect(amrf?.anthropic_beta).toBeUndefined();
      expect(amrf?.thinking).toBeUndefined();
      expect(amrf?.thinkingBudget).toBeUndefined();
    });

    test('should not strip anthropic_beta when staying on an Anthropic model', () => {
      const input = {
        model: 'anthropic.claude-opus-4-6-v1',
      };
      const result = bedrockInputParser.parse(input) as Record<string, unknown>;
      const amrf = result.additionalModelRequestFields as Record<string, unknown>;
      expect(amrf.anthropic_beta).toBeDefined();
      expect(Array.isArray(amrf.anthropic_beta)).toBe(true);
    });
  });
});
