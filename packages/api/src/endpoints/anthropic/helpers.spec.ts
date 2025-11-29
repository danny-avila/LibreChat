import {
  getClaudeHeaders,
  resolveFeatureFlag,
  checkPromptCacheSupport,
  BetaFeaturesConfig,
} from './helpers';

describe('checkPromptCacheSupport', () => {
  it('should return true for Claude 3.5 Sonnet models', () => {
    expect(checkPromptCacheSupport('claude-3-5-sonnet')).toBe(true);
    expect(checkPromptCacheSupport('claude-3.5-sonnet-20241022')).toBe(true);
  });

  it('should return false for Claude 3.5 Sonnet latest models', () => {
    expect(checkPromptCacheSupport('claude-3-5-sonnet-latest')).toBe(false);
    expect(checkPromptCacheSupport('claude-3.5-sonnet-latest')).toBe(false);
  });

  it('should return true for Claude 3.7 models', () => {
    expect(checkPromptCacheSupport('claude-3-7-sonnet')).toBe(true);
    expect(checkPromptCacheSupport('claude-3.7-sonnet-20250109')).toBe(true);
  });

  it('should return true for Claude 4+ models', () => {
    expect(checkPromptCacheSupport('claude-sonnet-4-20250514')).toBe(true);
    expect(checkPromptCacheSupport('claude-sonnet-4-5-20250929')).toBe(true);
    expect(checkPromptCacheSupport('claude-opus-4-20250514')).toBe(true);
    expect(checkPromptCacheSupport('claude-opus-4-5')).toBe(true);
    expect(checkPromptCacheSupport('claude-4-sonnet')).toBe(true);
  });
});

describe('resolveFeatureFlag', () => {
  it('should return default value when config is empty', () => {
    expect(resolveFeatureFlag('promptCaching', 'claude-3-5-sonnet', {})).toBe(true);
    expect(resolveFeatureFlag('promptCaching', 'claude-3-5-sonnet', {}, false)).toBe(false);
  });

  it('should return global setting when specified', () => {
    const config: BetaFeaturesConfig = { promptCaching: false };
    expect(resolveFeatureFlag('promptCaching', 'claude-3-5-sonnet', config)).toBe(false);
  });

  it('should return exact model override when specified', () => {
    const config: BetaFeaturesConfig = {
      promptCaching: true,
      modelOverrides: {
        'claude-sonnet-4': { promptCaching: false },
      },
    };
    expect(resolveFeatureFlag('promptCaching', 'claude-sonnet-4', config)).toBe(false);
    expect(resolveFeatureFlag('promptCaching', 'claude-3-5-sonnet', config)).toBe(true);
  });

  it('should support wildcard pattern matching', () => {
    const config: BetaFeaturesConfig = {
      output128k: true,
      modelOverrides: {
        'claude-3-7-*': { output128k: false },
      },
    };
    expect(resolveFeatureFlag('output128k', 'claude-3-7-sonnet', config)).toBe(false);
    expect(resolveFeatureFlag('output128k', 'claude-3-7-opus', config)).toBe(false);
    expect(resolveFeatureFlag('output128k', 'claude-3-5-sonnet', config)).toBe(true);
  });

  it('should prioritize exact match over wildcard', () => {
    const config: BetaFeaturesConfig = {
      context1m: true,
      modelOverrides: {
        'claude-sonnet-4-20250514': { context1m: false },
        'claude-sonnet-4-*': { context1m: true },
      },
    };
    expect(resolveFeatureFlag('context1m', 'claude-sonnet-4-20250514', config)).toBe(false);
  });

  it('should handle undefined feature in override gracefully', () => {
    const config: BetaFeaturesConfig = {
      promptCaching: true,
      context1m: false,
      modelOverrides: {
        'claude-sonnet-4': { promptCaching: false },
      },
    };
    expect(resolveFeatureFlag('context1m', 'claude-sonnet-4', config)).toBe(false);
  });
});

describe('getClaudeHeaders', () => {
  describe('default behavior (no betaConfig)', () => {
    it('should return undefined when no features apply', () => {
      const result = getClaudeHeaders('claude-3-opus', false);
      expect(result).toBeUndefined();
    });

    it('should include all default features for Claude 3.5 Sonnet', () => {
      const result = getClaudeHeaders('claude-3-5-sonnet', true);
      expect(result?.['anthropic-beta']).toContain('max-tokens-3-5-sonnet-2024-07-15');
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
      expect(result?.['anthropic-beta']).not.toContain('context-1m-2025-08-07');
    });

    it('should include all default features for Claude 3.7', () => {
      const result = getClaudeHeaders('claude-3-7-sonnet', true);
      expect(result?.['anthropic-beta']).toContain('token-efficient-tools-2025-02-19');
      expect(result?.['anthropic-beta']).toContain('output-128k-2025-02-19');
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
      expect(result?.['anthropic-beta']).not.toContain('context-1m-2025-08-07');
    });

    it('should include prompt caching and context1m for Claude Sonnet 4', () => {
      const result = getClaudeHeaders('claude-sonnet-4-20250514', true);
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
      expect(result?.['anthropic-beta']).toContain('context-1m-2025-08-07');
    });

    it('should not include context1m for non-sonnet Claude 4 models', () => {
      const result = getClaudeHeaders('claude-opus-4-20250514', true);
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
      expect(result?.['anthropic-beta']).not.toContain('context-1m-2025-08-07');
    });

    it('should include prompt caching and context1m for Claude Sonnet 4.5', () => {
      const result = getClaudeHeaders('claude-sonnet-4-5-20250929', true);
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
      expect(result?.['anthropic-beta']).toContain('context-1m-2025-08-07');
    });

    it('should include prompt caching for Claude Opus 4.5', () => {
      const result = getClaudeHeaders('claude-opus-4-5', true);
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
      expect(result?.['anthropic-beta']).not.toContain('context-1m-2025-08-07');
    });
  });

  describe('supportsCacheControl=false still enables non-caching features', () => {
    it('should include extendedMaxTokens for Claude 3.5 Sonnet', () => {
      const result = getClaudeHeaders('claude-3-5-sonnet', false);
      expect(result?.['anthropic-beta']).toContain('max-tokens-3-5-sonnet-2024-07-15');
      expect(result?.['anthropic-beta']).not.toContain('prompt-caching-2024-07-31');
    });

    it('should include tokenEfficientTools and output128k for Claude 3.7', () => {
      const result = getClaudeHeaders('claude-3-7-sonnet', false);
      expect(result?.['anthropic-beta']).toContain('token-efficient-tools-2025-02-19');
      expect(result?.['anthropic-beta']).toContain('output-128k-2025-02-19');
      expect(result?.['anthropic-beta']).not.toContain('prompt-caching-2024-07-31');
    });

    it('should include context1m for Claude Sonnet 4', () => {
      const result = getClaudeHeaders('claude-sonnet-4-20250514', false);
      expect(result?.['anthropic-beta']).toContain('context-1m-2025-08-07');
      expect(result?.['anthropic-beta']).not.toContain('prompt-caching-2024-07-31');
    });
  });

  describe('with betaConfig feature flags', () => {
    it('should disable prompt caching when flag is false', () => {
      const config: BetaFeaturesConfig = { promptCaching: false };
      const result = getClaudeHeaders('claude-3-5-sonnet', true, config);
      expect(result?.['anthropic-beta']).not.toContain('prompt-caching-2024-07-31');
      expect(result?.['anthropic-beta']).toContain('max-tokens-3-5-sonnet-2024-07-15');
    });

    it('should disable extended max tokens when flag is false', () => {
      const config: BetaFeaturesConfig = { extendedMaxTokens: false };
      const result = getClaudeHeaders('claude-3-5-sonnet', true, config);
      expect(result?.['anthropic-beta']).not.toContain('max-tokens-3-5-sonnet-2024-07-15');
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
    });

    it('should disable token efficient tools when flag is false', () => {
      const config: BetaFeaturesConfig = { tokenEfficientTools: false };
      const result = getClaudeHeaders('claude-3-7-sonnet', true, config);
      expect(result?.['anthropic-beta']).not.toContain('token-efficient-tools-2025-02-19');
      expect(result?.['anthropic-beta']).toContain('output-128k-2025-02-19');
    });

    it('should disable output 128k when flag is false', () => {
      const config: BetaFeaturesConfig = { output128k: false };
      const result = getClaudeHeaders('claude-3-7-sonnet', true, config);
      expect(result?.['anthropic-beta']).not.toContain('output-128k-2025-02-19');
      expect(result?.['anthropic-beta']).toContain('token-efficient-tools-2025-02-19');
    });

    it('should disable context 1m when flag is false', () => {
      const config: BetaFeaturesConfig = { context1m: false };
      const result = getClaudeHeaders('claude-sonnet-4-20250514', true, config);
      expect(result?.['anthropic-beta']).not.toContain('context-1m-2025-08-07');
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
    });

    it('should return undefined when all features are disabled', () => {
      const config: BetaFeaturesConfig = {
        promptCaching: false,
        extendedMaxTokens: false,
        tokenEfficientTools: false,
        output128k: false,
        context1m: false,
      };
      const result = getClaudeHeaders('claude-3-opus', false, config);
      expect(result).toBeUndefined();
    });
  });

  describe('with model overrides', () => {
    it('should apply exact model override', () => {
      const config: BetaFeaturesConfig = {
        context1m: true,
        modelOverrides: {
          'claude-sonnet-4-20250514': { context1m: false },
        },
      };
      const result = getClaudeHeaders('claude-sonnet-4-20250514', true, config);
      expect(result?.['anthropic-beta']).not.toContain('context-1m-2025-08-07');
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
    });

    it('should apply wildcard model override', () => {
      const config: BetaFeaturesConfig = {
        output128k: true,
        modelOverrides: {
          'claude-3-7-*': { output128k: false },
        },
      };
      const result = getClaudeHeaders('claude-3-7-sonnet', true, config);
      expect(result?.['anthropic-beta']).not.toContain('output-128k-2025-02-19');
      expect(result?.['anthropic-beta']).toContain('token-efficient-tools-2025-02-19');
    });

    it('should not apply override to non-matching models', () => {
      const config: BetaFeaturesConfig = {
        extendedMaxTokens: true,
        modelOverrides: {
          'claude-3-7-*': { extendedMaxTokens: false },
        },
      };
      const result = getClaudeHeaders('claude-3-5-sonnet', true, config);
      expect(result?.['anthropic-beta']).toContain('max-tokens-3-5-sonnet-2024-07-15');
    });
  });

  describe('backward compatibility', () => {
    it('should maintain backward compatible defaults when no config provided', () => {
      const result = getClaudeHeaders('claude-3-5-sonnet', true);
      expect(result?.['anthropic-beta']).toContain('max-tokens-3-5-sonnet-2024-07-15');
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
    });

    it('should maintain backward compatible defaults for claude-3-7', () => {
      const result = getClaudeHeaders('claude-3-7-sonnet', true);
      expect(result?.['anthropic-beta']).toContain('token-efficient-tools-2025-02-19');
      expect(result?.['anthropic-beta']).toContain('output-128k-2025-02-19');
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
    });

    it('should work with empty config object', () => {
      const result = getClaudeHeaders('claude-3-5-sonnet', true, {});
      expect(result?.['anthropic-beta']).toContain('max-tokens-3-5-sonnet-2024-07-15');
      expect(result?.['anthropic-beta']).toContain('prompt-caching-2024-07-31');
    });
  });

  describe('model-specific feature application', () => {
    it('should not add extendedMaxTokens for non-3.5-sonnet models even when enabled', () => {
      const config: BetaFeaturesConfig = { extendedMaxTokens: true };
      const result = getClaudeHeaders('claude-3-7-sonnet', true, config);
      expect(result?.['anthropic-beta']).not.toContain('max-tokens-3-5-sonnet-2024-07-15');
    });

    it('should not add tokenEfficientTools for non-3.7 models even when enabled', () => {
      const config: BetaFeaturesConfig = { tokenEfficientTools: true };
      const result = getClaudeHeaders('claude-3-5-sonnet', true, config);
      expect(result?.['anthropic-beta']).not.toContain('token-efficient-tools-2025-02-19');
    });

    it('should not add output128k for non-3.7 models even when enabled', () => {
      const config: BetaFeaturesConfig = { output128k: true };
      const result = getClaudeHeaders('claude-3-5-sonnet', true, config);
      expect(result?.['anthropic-beta']).not.toContain('output-128k-2025-02-19');
    });
  });
});
