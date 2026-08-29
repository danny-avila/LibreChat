import { Tokenizer as AiTokenizer } from 'ai-tokenizer';
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

  describe('initEncoding', () => {
    it('uses the established estimate while the encoding initializes', () => {
      const text = 'Cold start token count';

      expect(Tokenizer.getTokenCount(text, 'o200k_base')).toBe(Math.ceil(text.length / 4));
    });

    it('should load o200k_base encoding', async () => {
      await Tokenizer.initEncoding('o200k_base');
      const count = Tokenizer.getTokenCount('Hello, world!', 'o200k_base');
      expect(count).toBeGreaterThan(0);
    });

    it('should load claude encoding', async () => {
      await Tokenizer.initEncoding('claude');
      const count = Tokenizer.getTokenCount('Hello, world!', 'claude');
      expect(count).toBeGreaterThan(0);
    });

    it('should deduplicate concurrent init calls', async () => {
      const [, , count] = await Promise.all([
        Tokenizer.initEncoding('o200k_base'),
        Tokenizer.initEncoding('o200k_base'),
        Tokenizer.initEncoding('o200k_base').then(() =>
          Tokenizer.getTokenCount('test', 'o200k_base'),
        ),
      ]);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('getTokenCount', () => {
    beforeAll(async () => {
      await Tokenizer.initEncoding('o200k_base');
      await Tokenizer.initEncoding('claude');
    });

    it('should return the number of tokens in the given text', () => {
      const count = Tokenizer.getTokenCount('Hello, world!', 'o200k_base');
      expect(count).toBeGreaterThan(0);
    });

    it('should count tokens using claude encoding', () => {
      const count = Tokenizer.getTokenCount('Hello, world!', 'claude');
      expect(count).toBeGreaterThan(0);
    });

    it.each([
      { label: 'an uninterrupted non-whitespace run', text: '_'.repeat(4 * 1024 + 1) },
      { label: 'an oversized input', text: 'word '.repeat(1024) },
      { label: 'multibyte input', text: '界'.repeat(4 * 1024 + 1) },
    ])('uses a conservative estimate without tokenizing $label', ({ text }) => {
      const count = jest.spyOn(AiTokenizer.prototype, 'count');
      try {
        expect(Tokenizer.getTokenCount(text, 'o200k_base')).toBe(Buffer.byteLength(text, 'utf8'));
        expect(count).not.toHaveBeenCalled();
      } finally {
        count.mockRestore();
      }
    });
  });

  describe('createExactTokenCounter', () => {
    it('throws instead of returning a fallback estimate after a tokenizer failure', async () => {
      const counter = await Tokenizer.createExactTokenCounter('o200k_base');
      const count = jest.spyOn(AiTokenizer.prototype, 'count').mockImplementationOnce(() => {
        throw new Error('tokenizer failed');
      });
      try {
        expect(() => counter('Stable cached context')).toThrow('tokenizer failed');
      } finally {
        count.mockRestore();
        await Tokenizer.initEncoding('o200k_base');
      }
    });

    it('uses a conservative estimate for unsafe input without invoking the tokenizer', async () => {
      const counter = await Tokenizer.createExactTokenCounter('o200k_base');
      const count = jest.spyOn(AiTokenizer.prototype, 'count');
      try {
        const text = '_'.repeat(4 * 1024 + 1);
        expect(counter(text)).toBe(Buffer.byteLength(text, 'utf8'));
        expect(count).not.toHaveBeenCalled();
      } finally {
        count.mockRestore();
      }
    });
  });
});
