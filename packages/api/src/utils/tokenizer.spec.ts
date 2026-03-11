import { logger } from '@librechat/data-schemas';
import Tokenizer from './tokenizer';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

describe('Tokenizer', () => {
  it('should be a singleton (same instance)', async () => {
    const AnotherTokenizer = await import('./tokenizer');
    expect(Tokenizer).toBe(AnotherTokenizer.default);
  });

  describe('getTokenizer', () => {
    it('should create a tokenizer for o200k_base encoding', () => {
      const tokenizer = Tokenizer.getTokenizer('o200k_base');
      expect(tokenizer).toBeDefined();
      expect(typeof tokenizer.count).toBe('function');
    });

    it('should create a tokenizer for claude encoding', () => {
      const tokenizer = Tokenizer.getTokenizer('claude');
      expect(tokenizer).toBeDefined();
      expect(typeof tokenizer.count).toBe('function');
    });

    it('should return cached tokenizer if previously fetched', () => {
      const tokenizer1 = Tokenizer.getTokenizer('o200k_base');
      const tokenizer2 = Tokenizer.getTokenizer('o200k_base');
      expect(tokenizer1).toBe(tokenizer2);
    });

    it('should default to o200k_base when no encoding specified', () => {
      const tokenizer = Tokenizer.getTokenizer();
      expect(tokenizer).toBeDefined();
      expect(typeof tokenizer.count).toBe('function');
    });
  });

  describe('getTokenCount', () => {
    it('should return the number of tokens in the given text', () => {
      const text = 'Hello, world!';
      const count = Tokenizer.getTokenCount(text, 'o200k_base');
      expect(count).toBeGreaterThan(0);
    });

    it('should count tokens using claude encoding', () => {
      const text = 'Hello, world!';
      const count = Tokenizer.getTokenCount(text, 'claude');
      expect(count).toBeGreaterThan(0);
    });

    it('should recover from errors by recreating the tokenizer', () => {
      const mockLoggerError = jest.spyOn(logger, 'error');

      const originalGetTokenizer = Tokenizer.getTokenizer.bind(Tokenizer);
      let callCount = 0;
      const spy = jest.spyOn(Tokenizer, 'getTokenizer').mockImplementation((...args) => {
        callCount++;
        if (callCount === 1) {
          const fake = originalGetTokenizer(...args);
          fake.count = () => {
            throw new Error('Forced error');
          };
          return fake;
        }
        spy.mockRestore();
        return originalGetTokenizer(...args);
      });

      const count = Tokenizer.getTokenCount('Hello again', 'o200k_base');
      expect(count).toBeGreaterThan(0);
      expect(mockLoggerError).toHaveBeenCalled();

      mockLoggerError.mockRestore();
    });
  });
});
