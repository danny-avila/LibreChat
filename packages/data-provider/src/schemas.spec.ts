import { anthropicSettings } from './schemas';

describe('anthropicSettings', () => {
  describe('maxOutputTokens.reset()', () => {
    const { reset } = anthropicSettings.maxOutputTokens;

    describe('Claude Sonnet models', () => {
      it('should return 64K for claude-sonnet-4', () => {
        expect(reset('claude-sonnet-4')).toBe(64000);
      });

      it('should return 64K for claude-sonnet-4-5', () => {
        expect(reset('claude-sonnet-4-5')).toBe(64000);
      });

      it('should return 64K for claude-sonnet-5', () => {
        expect(reset('claude-sonnet-5')).toBe(64000);
      });

      it('should return 64K for future versions like claude-sonnet-9', () => {
        expect(reset('claude-sonnet-9')).toBe(64000);
      });
    });

    describe('Claude Haiku models', () => {
      it('should return 64K for claude-haiku-4-5', () => {
        expect(reset('claude-haiku-4-5')).toBe(64000);
      });

      it('should return 64K for claude-haiku-4', () => {
        expect(reset('claude-haiku-4')).toBe(64000);
      });

      it('should return 64K for claude-haiku-5', () => {
        expect(reset('claude-haiku-5')).toBe(64000);
      });

      it('should return 64K for future versions like claude-haiku-9', () => {
        expect(reset('claude-haiku-9')).toBe(64000);
      });
    });

    describe('Claude Opus 4.0-4.4 models (32K limit)', () => {
      it('should return 32K for claude-opus-4', () => {
        expect(reset('claude-opus-4')).toBe(32000);
      });

      it('should return 32K for claude-opus-4-0', () => {
        expect(reset('claude-opus-4-0')).toBe(32000);
      });

      it('should return 32K for claude-opus-4-1', () => {
        expect(reset('claude-opus-4-1')).toBe(32000);
      });

      it('should return 32K for claude-opus-4-2', () => {
        expect(reset('claude-opus-4-2')).toBe(32000);
      });

      it('should return 32K for claude-opus-4-3', () => {
        expect(reset('claude-opus-4-3')).toBe(32000);
      });

      it('should return 32K for claude-opus-4-4', () => {
        expect(reset('claude-opus-4-4')).toBe(32000);
      });

      it('should return 32K for claude-opus-4.0', () => {
        expect(reset('claude-opus-4.0')).toBe(32000);
      });

      it('should return 32K for claude-opus-4.1', () => {
        expect(reset('claude-opus-4.1')).toBe(32000);
      });
    });

    describe('Claude Opus 4.5+ models (64K limit - future-proof)', () => {
      it('should return 64K for claude-opus-4-5', () => {
        expect(reset('claude-opus-4-5')).toBe(64000);
      });

      it('should return 64K for claude-opus-4-6', () => {
        expect(reset('claude-opus-4-6')).toBe(64000);
      });

      it('should return 64K for claude-opus-4-7', () => {
        expect(reset('claude-opus-4-7')).toBe(64000);
      });

      it('should return 64K for claude-opus-4-8', () => {
        expect(reset('claude-opus-4-8')).toBe(64000);
      });

      it('should return 64K for claude-opus-4-9', () => {
        expect(reset('claude-opus-4-9')).toBe(64000);
      });

      it('should return 64K for claude-opus-4.5', () => {
        expect(reset('claude-opus-4.5')).toBe(64000);
      });

      it('should return 64K for claude-opus-4.6', () => {
        expect(reset('claude-opus-4.6')).toBe(64000);
      });
    });

    describe('Claude Opus 4.10+ models (double-digit minor versions)', () => {
      it('should return 64K for claude-opus-4-10', () => {
        expect(reset('claude-opus-4-10')).toBe(64000);
      });

      it('should return 64K for claude-opus-4-11', () => {
        expect(reset('claude-opus-4-11')).toBe(64000);
      });

      it('should return 64K for claude-opus-4-15', () => {
        expect(reset('claude-opus-4-15')).toBe(64000);
      });

      it('should return 64K for claude-opus-4-20', () => {
        expect(reset('claude-opus-4-20')).toBe(64000);
      });

      it('should return 64K for claude-opus-4.10', () => {
        expect(reset('claude-opus-4.10')).toBe(64000);
      });
    });

    describe('Claude Opus 5+ models (future major versions)', () => {
      it('should return 64K for claude-opus-5', () => {
        expect(reset('claude-opus-5')).toBe(64000);
      });

      it('should return 64K for claude-opus-6', () => {
        expect(reset('claude-opus-6')).toBe(64000);
      });

      it('should return 64K for claude-opus-7', () => {
        expect(reset('claude-opus-7')).toBe(64000);
      });

      it('should return 64K for claude-opus-9', () => {
        expect(reset('claude-opus-9')).toBe(64000);
      });

      it('should return 64K for claude-opus-5-0', () => {
        expect(reset('claude-opus-5-0')).toBe(64000);
      });

      it('should return 64K for claude-opus-5.0', () => {
        expect(reset('claude-opus-5.0')).toBe(64000);
      });
    });

    describe('Model name variations with dates and suffixes', () => {
      it('should return 64K for claude-opus-4-5-20250420', () => {
        expect(reset('claude-opus-4-5-20250420')).toBe(64000);
      });

      it('should return 64K for claude-opus-4-6-20260101', () => {
        expect(reset('claude-opus-4-6-20260101')).toBe(64000);
      });

      it('should return 32K for claude-opus-4-1-20250805', () => {
        expect(reset('claude-opus-4-1-20250805')).toBe(32000);
      });

      it('should return 32K for claude-opus-4-0-20240229', () => {
        expect(reset('claude-opus-4-0-20240229')).toBe(32000);
      });
    });

    describe('Legacy Claude models', () => {
      it('should return 8192 for claude-3-opus', () => {
        expect(reset('claude-3-opus')).toBe(8192);
      });

      it('should return 8192 for claude-3-5-sonnet', () => {
        expect(reset('claude-3-5-sonnet')).toBe(8192);
      });

      it('should return 8192 for claude-3-5-haiku', () => {
        expect(reset('claude-3-5-haiku')).toBe(8192);
      });

      it('should return 8192 for claude-3-7-sonnet', () => {
        expect(reset('claude-3-7-sonnet')).toBe(8192);
      });

      it('should return 8192 for claude-2', () => {
        expect(reset('claude-2')).toBe(8192);
      });

      it('should return 8192 for claude-2.1', () => {
        expect(reset('claude-2.1')).toBe(8192);
      });

      it('should return 8192 for claude-instant', () => {
        expect(reset('claude-instant')).toBe(8192);
      });
    });

    describe('Non-Claude models and edge cases', () => {
      it('should return 8192 for unknown model', () => {
        expect(reset('unknown-model')).toBe(8192);
      });

      it('should return 8192 for empty string', () => {
        expect(reset('')).toBe(8192);
      });

      it('should return 8192 for gpt-4', () => {
        expect(reset('gpt-4')).toBe(8192);
      });

      it('should return 8192 for gemini-pro', () => {
        expect(reset('gemini-pro')).toBe(8192);
      });
    });

    describe('Regex pattern edge cases', () => {
      it('should not match claude-opus-3', () => {
        expect(reset('claude-opus-3')).toBe(8192);
      });

      it('should not match opus-4-5 without claude prefix', () => {
        expect(reset('opus-4-5')).toBe(8192);
      });

      it('should NOT match claude.opus.4.5 (incorrect separator pattern)', () => {
        // Model names use hyphens after "claude", not dots
        expect(reset('claude.opus.4.5')).toBe(8192);
      });

      it('should match claude-opus45 (no separator after opus)', () => {
        // The regex allows optional separators, so "45" can follow directly
        // In practice, Anthropic uses separators, but regex is permissive
        expect(reset('claude-opus45')).toBe(64000);
      });
    });
  });

  describe('maxOutputTokens.set()', () => {
    const { set } = anthropicSettings.maxOutputTokens;

    describe('Claude Sonnet and Haiku 4+ models (64K cap)', () => {
      it('should cap at 64K for claude-sonnet-4 when value exceeds', () => {
        expect(set(100000, 'claude-sonnet-4')).toBe(64000);
      });

      it('should allow 50K for claude-sonnet-4', () => {
        expect(set(50000, 'claude-sonnet-4')).toBe(50000);
      });

      it('should cap at 64K for claude-haiku-4-5 when value exceeds', () => {
        expect(set(80000, 'claude-haiku-4-5')).toBe(64000);
      });
    });

    describe('Claude Opus 4.5+ models (64K cap)', () => {
      it('should cap at 64K for claude-opus-4-5 when value exceeds', () => {
        expect(set(100000, 'claude-opus-4-5')).toBe(64000);
      });

      it('should cap at model-specific 64K limit, not global 128K limit', () => {
        // Values between 64K and 128K should be capped at 64K (model limit)
        // This verifies the fix for the unreachable code issue
        expect(set(70000, 'claude-opus-4-5')).toBe(64000);
        expect(set(80000, 'claude-opus-4-5')).toBe(64000);
        expect(set(100000, 'claude-opus-4-5')).toBe(64000);
        expect(set(128000, 'claude-opus-4-5')).toBe(64000);

        // Values above 128K should also be capped at 64K (not 128K)
        expect(set(150000, 'claude-opus-4-5')).toBe(64000);
      });

      it('should allow 50K for claude-opus-4-5', () => {
        expect(set(50000, 'claude-opus-4-5')).toBe(50000);
      });

      it('should cap at 64K for claude-opus-4-6', () => {
        expect(set(80000, 'claude-opus-4-6')).toBe(64000);
      });

      it('should cap at 64K for claude-opus-5', () => {
        expect(set(100000, 'claude-opus-5')).toBe(64000);
      });

      it('should cap at 64K for claude-opus-4-10', () => {
        expect(set(100000, 'claude-opus-4-10')).toBe(64000);
      });
    });

    describe('Claude Opus 4.0-4.4 models (32K cap)', () => {
      it('should cap at 32K for claude-opus-4', () => {
        expect(set(50000, 'claude-opus-4')).toBe(32000);
      });

      it('should allow 20K for claude-opus-4', () => {
        expect(set(20000, 'claude-opus-4')).toBe(20000);
      });

      it('should cap at 32K for claude-opus-4-1', () => {
        expect(set(50000, 'claude-opus-4-1')).toBe(32000);
      });

      it('should cap at 32K for claude-opus-4-4', () => {
        expect(set(40000, 'claude-opus-4-4')).toBe(32000);
      });
    });

    describe('Global 128K cap for all models', () => {
      it('should cap at model-specific limit first, then global', () => {
        // claude-sonnet-4 has 64K limit, so caps at 64K not 128K
        expect(set(150000, 'claude-sonnet-4')).toBe(64000);
      });

      it('should cap at 128K for claude-3 models', () => {
        expect(set(150000, 'claude-3-opus')).toBe(128000);
      });

      it('should cap at 128K for unknown models', () => {
        expect(set(200000, 'unknown-model')).toBe(128000);
      });
    });

    describe('Valid values within limits', () => {
      it('should allow valid values for legacy models', () => {
        expect(set(8000, 'claude-3-opus')).toBe(8000);
      });

      it('should allow 1 token minimum', () => {
        expect(set(1, 'claude-opus-4-5')).toBe(1);
      });

      it('should allow 128K exactly', () => {
        expect(set(128000, 'claude-3-opus')).toBe(128000);
      });
    });
  });
});
