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

    test('should match anthropic.claude-sonnet-4 model', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-opus-5 model', () => {
      const input = {
        model: 'anthropic.claude-opus-5',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-haiku-6 model', () => {
      const input = {
        model: 'anthropic.claude-haiku-6',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-4-sonnet model', () => {
      const input = {
        model: 'anthropic.claude-4-sonnet',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-4.5-sonnet model', () => {
      const input = {
        model: 'anthropic.claude-4.5-sonnet',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should match anthropic.claude-4-7-sonnet model', () => {
      const input = {
        model: 'anthropic.claude-4-7-sonnet',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBe(true);
      expect(additionalFields.thinkingBudget).toBe(2000);
      expect(additionalFields.anthropic_beta).toEqual(['output-128k-2025-02-19']);
    });

    test('should not match non-Claude models', () => {
      const input = {
        model: 'some-other-model',
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      expect(result.additionalModelRequestFields).toBeUndefined();
    });

    test('should respect explicit thinking configuration', () => {
      const input = {
        model: 'anthropic.claude-sonnet-4',
        thinking: false,
      };
      const result = bedrockInputParser.parse(input) as BedrockConverseInput;
      const additionalFields = result.additionalModelRequestFields as Record<string, unknown>;
      expect(additionalFields.thinking).toBeUndefined();
      expect(additionalFields.thinkingBudget).toBeUndefined();
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
