import {
  findMatchingPattern,
  getModelMaxTokens,
  getModelMaxOutputTokens,
  matchModelName,
  maxTokensMap,
} from '../src/tokens';
import { EModelEndpoint } from '../src/schemas';

describe('Token Pattern Matching', () => {
  describe('findMatchingPattern', () => {
    const testMap: Record<string, number> = {
      'claude-': 100000,
      'claude-3': 200000,
      'claude-3-opus': 200000,
      'gpt-4': 8000,
      'gpt-4-turbo': 128000,
    };

    it('should match exact model names', () => {
      expect(findMatchingPattern('claude-3-opus', testMap)).toBe('claude-3-opus');
      expect(findMatchingPattern('gpt-4-turbo', testMap)).toBe('gpt-4-turbo');
    });

    it('should match more specific patterns first (reverse order)', () => {
      // claude-3-opus-20240229 should match 'claude-3-opus' not 'claude-3' or 'claude-'
      expect(findMatchingPattern('claude-3-opus-20240229', testMap)).toBe('claude-3-opus');
    });

    it('should fall back to broader patterns when no specific match', () => {
      // claude-3-haiku should match 'claude-3' (not 'claude-3-opus')
      expect(findMatchingPattern('claude-3-haiku', testMap)).toBe('claude-3');
    });

    it('should be case-insensitive', () => {
      expect(findMatchingPattern('Claude-3-Opus', testMap)).toBe('claude-3-opus');
      expect(findMatchingPattern('GPT-4-TURBO', testMap)).toBe('gpt-4-turbo');
    });

    it('should return null for unmatched models', () => {
      expect(findMatchingPattern('unknown-model', testMap)).toBeNull();
      expect(findMatchingPattern('llama-2', testMap)).toBeNull();
    });

    it('should NOT match when pattern appears in middle of model name (startsWith behavior)', () => {
      // This is the key fix: "my-claude-wrapper" should NOT match "claude-"
      expect(findMatchingPattern('my-claude-wrapper', testMap)).toBeNull();
      expect(findMatchingPattern('openai-gpt-4-proxy', testMap)).toBeNull();
      expect(findMatchingPattern('custom-claude-3-service', testMap)).toBeNull();
    });

    it('should handle empty string model name', () => {
      expect(findMatchingPattern('', testMap)).toBeNull();
    });

    it('should handle empty tokens map', () => {
      expect(findMatchingPattern('claude-3', {})).toBeNull();
    });
  });

  describe('getModelMaxTokens', () => {
    it('should return exact match tokens', () => {
      expect(getModelMaxTokens('gpt-4o', EModelEndpoint.openAI)).toBe(127500);
      expect(getModelMaxTokens('claude-3-opus', EModelEndpoint.anthropic)).toBe(200000);
    });

    it('should return pattern-matched tokens', () => {
      // claude-3-opus-20240229 should match claude-3-opus pattern
      expect(getModelMaxTokens('claude-3-opus-20240229', EModelEndpoint.anthropic)).toBe(200000);
    });

    it('should return undefined for unknown models', () => {
      expect(getModelMaxTokens('completely-unknown-model', EModelEndpoint.openAI)).toBeUndefined();
    });

    it('should fall back to openAI for unknown endpoints', () => {
      const result = getModelMaxTokens('gpt-4o', 'unknown-endpoint');
      expect(result).toBe(127500);
    });

    it('should handle non-string input gracefully', () => {
      expect(getModelMaxTokens(null as unknown as string)).toBeUndefined();
      expect(getModelMaxTokens(undefined as unknown as string)).toBeUndefined();
      expect(getModelMaxTokens(123 as unknown as string)).toBeUndefined();
    });

    it('should NOT match model names with pattern in middle', () => {
      // A model like "my-gpt-4-wrapper" should not match "gpt-4"
      expect(getModelMaxTokens('my-gpt-4-wrapper', EModelEndpoint.openAI)).toBeUndefined();
    });
  });

  describe('getModelMaxOutputTokens', () => {
    it('should return exact match output tokens', () => {
      expect(getModelMaxOutputTokens('o1', EModelEndpoint.openAI)).toBe(32268);
      expect(getModelMaxOutputTokens('claude-3-opus', EModelEndpoint.anthropic)).toBe(4096);
    });

    it('should return pattern-matched output tokens', () => {
      expect(getModelMaxOutputTokens('claude-3-opus-20240229', EModelEndpoint.anthropic)).toBe(
        4096,
      );
    });

    it('should return system_default for unknown models (openAI endpoint)', () => {
      expect(getModelMaxOutputTokens('unknown-model', EModelEndpoint.openAI)).toBe(32000);
    });

    it('should handle non-string input gracefully', () => {
      expect(getModelMaxOutputTokens(null as unknown as string)).toBeUndefined();
      expect(getModelMaxOutputTokens(undefined as unknown as string)).toBeUndefined();
    });
  });

  describe('matchModelName', () => {
    it('should return exact match model name', () => {
      expect(matchModelName('gpt-4o', EModelEndpoint.openAI)).toBe('gpt-4o');
    });

    it('should return pattern key for pattern matches', () => {
      expect(matchModelName('claude-3-opus-20240229', EModelEndpoint.anthropic)).toBe(
        'claude-3-opus',
      );
    });

    it('should return input for unknown models', () => {
      expect(matchModelName('unknown-model', EModelEndpoint.openAI)).toBe('unknown-model');
    });

    it('should handle non-string input gracefully', () => {
      expect(matchModelName(null as unknown as string)).toBeUndefined();
    });
  });

  describe('maxTokensMap structure', () => {
    it('should have entries for all major endpoints', () => {
      expect(maxTokensMap[EModelEndpoint.openAI]).toBeDefined();
      expect(maxTokensMap[EModelEndpoint.anthropic]).toBeDefined();
      expect(maxTokensMap[EModelEndpoint.google]).toBeDefined();
      expect(maxTokensMap[EModelEndpoint.azureOpenAI]).toBeDefined();
      expect(maxTokensMap[EModelEndpoint.bedrock]).toBeDefined();
    });

    it('should have positive token values', () => {
      Object.values(maxTokensMap).forEach((endpointMap) => {
        Object.entries(endpointMap).forEach(([model, tokens]) => {
          expect(tokens).toBeGreaterThan(0);
        });
      });
    });
  });
});
