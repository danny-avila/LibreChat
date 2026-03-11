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
  });
});
