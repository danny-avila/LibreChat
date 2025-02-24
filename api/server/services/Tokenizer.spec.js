/**
 * @file Tokenizer.spec.cjs
 *
 * Tests the real TokenizerSingleton (no mocking of `tiktoken`).
 * Make sure to install `tiktoken` and have it configured properly.
 */

const Tokenizer = require('./Tokenizer'); // <-- Adjust path to your singleton file
const { logger } = require('~/config');

describe('Tokenizer', () => {
  it('should be a singleton (same instance)', () => {
    const AnotherTokenizer = require('./Tokenizer'); // same path
    expect(Tokenizer).toBe(AnotherTokenizer);
  });

  describe('getTokenizer', () => {
    it('should create an encoder for an explicit model name (e.g., "gpt-4")', () => {
      // The real `encoding_for_model` will be called internally
      // as soon as we pass isModelName = true.
      const tokenizer = Tokenizer.getTokenizer('gpt-4', true);

      // Basic sanity checks
      expect(tokenizer).toBeDefined();
      // You can optionally check certain properties from `tiktoken` if they exist
      // e.g., expect(typeof tokenizer.encode).toBe('function');
    });

    it('should create an encoder for a known encoding (e.g., "cl100k_base")', () => {
      // The real `get_encoding` will be called internally
      // as soon as we pass isModelName = false.
      const tokenizer = Tokenizer.getTokenizer('cl100k_base', false);

      expect(tokenizer).toBeDefined();
      // e.g., expect(typeof tokenizer.encode).toBe('function');
    });

    it('should return cached tokenizer if previously fetched', () => {
      const tokenizer1 = Tokenizer.getTokenizer('cl100k_base', false);
      const tokenizer2 = Tokenizer.getTokenizer('cl100k_base', false);
      // Should be the exact same instance from the cache
      expect(tokenizer1).toBe(tokenizer2);
    });
  });

  describe('freeAndResetAllEncoders', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should free all encoders and reset tokenizerCallsCount to 1', () => {
      // By creating two different encodings, we populate the cache
      Tokenizer.getTokenizer('cl100k_base', false);
      Tokenizer.getTokenizer('r50k_base', false);

      // Now free them
      Tokenizer.freeAndResetAllEncoders();

      // The internal cache is cleared
      expect(Tokenizer.tokenizersCache['cl100k_base']).toBeUndefined();
      expect(Tokenizer.tokenizersCache['r50k_base']).toBeUndefined();

      // tokenizerCallsCount is reset to 1
      expect(Tokenizer.tokenizerCallsCount).toBe(1);
    });

    it('should catch and log errors if freeing fails', () => {
      // Mock logger.error before the test
      const mockLoggerError = jest.spyOn(logger, 'error');

      // Set up a problematic tokenizer in the cache
      Tokenizer.tokenizersCache['cl100k_base'] = {
        free() {
          throw new Error('Intentional free error');
        },
      };

      // Should not throw uncaught errors
      Tokenizer.freeAndResetAllEncoders();

      // Verify logger.error was called with correct arguments
      expect(mockLoggerError).toHaveBeenCalledWith(
        '[Tokenizer] Free and reset encoders error',
        expect.any(Error),
      );

      // Clean up
      mockLoggerError.mockRestore();
      Tokenizer.tokenizersCache = {};
    });
  });

  describe('getTokenCount', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      Tokenizer.freeAndResetAllEncoders();
    });

    it('should return the number of tokens in the given text', () => {
      const text = 'Hello, world!';
      const count = Tokenizer.getTokenCount(text, 'cl100k_base');
      expect(count).toBeGreaterThan(0);
    });

    it('should reset encoders if an error is thrown', () => {
      // We can simulate an error by temporarily overriding the selected tokenizer’s `encode` method.
      const tokenizer = Tokenizer.getTokenizer('cl100k_base', false);
      const originalEncode = tokenizer.encode;
      tokenizer.encode = () => {
        throw new Error('Forced error');
      };

      // Despite the forced error, the code should catch and reset, then re-encode
      const count = Tokenizer.getTokenCount('Hello again', 'cl100k_base');
      expect(count).toBeGreaterThan(0);

      // Restore the original encode
      tokenizer.encode = originalEncode;
    });

    it('should reset tokenizers after 25 calls', () => {
      // Spy on freeAndResetAllEncoders
      const resetSpy = jest.spyOn(Tokenizer, 'freeAndResetAllEncoders');

      // Make 24 calls; should NOT reset yet
      for (let i = 0; i < 24; i++) {
        Tokenizer.getTokenCount('test text', 'cl100k_base');
      }
      expect(resetSpy).not.toHaveBeenCalled();

      // 25th call triggers the reset
      Tokenizer.getTokenCount('the 25th call!', 'cl100k_base');
      expect(resetSpy).toHaveBeenCalledTimes(1);
    });
  });
});
