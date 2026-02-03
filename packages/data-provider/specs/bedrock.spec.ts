import { bedrockInputParser } from '../src/bedrock';
import type { BedrockConverseInput } from '../src/bedrock';

describe('bedrockInputParser', () => {
  describe('Model Matching for Reasoning Configuration', () => {
    test('should match anthropic.claude-3-7-sonnet model', () => {
      const input = {
        model: 'anthropic.claude-3-7-sonnet',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-sonnet-4 model with 1M context header', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual([
        'output-128k-2025-02-19',
        'context-1m-2025-08-07',
      ]);
    });

    test('should match anthropic.claude-opus-5 model without 1M context header', () => {
      const input = {
        model: 'anthropic.claude-opus-5',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-haiku-6 model without 1M context header', () => {
      const input = {
        model: 'anthropic.claude-haiku-6',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-4-sonnet model with 1M context header', () => {
      const input = {
        model: 'anthropic.claude-4-sonnet',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
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
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
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
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
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
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
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
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      expect(result.additionalModelRequestFields).toBeUndefined();
    });

    test('should not add anthropic_beta to Moonshot Kimi K2 models', () => {
      const input = {
        model: 'moonshot.kimi-k2-0711-thinking',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as
        | Record<string, unknown>
        | undefined;
      expect(additionalFields?.anthropic_beta).toBeUndefined();
    });

    test('should not add anthropic_beta to DeepSeek models', () => {
      const input = {
        model: 'deepseek.deepseek-r1',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
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
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
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
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(3000);
    });
  });
});
