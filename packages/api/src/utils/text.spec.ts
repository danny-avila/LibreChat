import { processTextWithTokenLimit } from './text';
import Tokenizer from './tokenizer';

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

/**
 * OLD IMPLEMENTATION (Binary Search) - kept for comparison testing
 * This is the original algorithm that caused CPU spikes
 */
async function processTextWithTokenLimitOLD({
  text,
  tokenLimit,
  tokenCountFn,
}: {
  text: string;
  tokenLimit: number;
  tokenCountFn: (text: string) => number;
}): Promise<{ text: string; tokenCount: number; wasTruncated: boolean }> {
  const originalTokenCount = await tokenCountFn(text);

  if (originalTokenCount <= tokenLimit) {
    return {
      text,
      tokenCount: originalTokenCount,
      wasTruncated: false,
    };
  }

  let low = 0;
  let high = text.length;
  let bestText = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const truncatedText = text.substring(0, mid);
    const tokenCount = await tokenCountFn(truncatedText);

    if (tokenCount <= tokenLimit) {
      bestText = truncatedText;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const finalTokenCount = await tokenCountFn(bestText);

  return {
    text: bestText,
    tokenCount: finalTokenCount,
    wasTruncated: true,
  };
}

/**
 * Creates a wrapper around Tokenizer.getTokenCount that tracks call count
 */
const createRealTokenCounter = () => {
  let callCount = 0;
  const tokenCountFn = (text: string): number => {
    callCount++;
    return Tokenizer.getTokenCount(text, 'cl100k_base');
  };
  return {
    tokenCountFn,
    getCallCount: () => callCount,
    resetCallCount: () => {
      callCount = 0;
    },
  };
};

describe('processTextWithTokenLimit', () => {
  /**
   * Creates a mock token count function that simulates realistic token counting.
   * Roughly 4 characters per token (common for English text).
   * Tracks call count to verify efficiency.
   */
  const createMockTokenCounter = () => {
    let callCount = 0;
    const tokenCountFn = (text: string): number => {
      callCount++;
      return Math.ceil(text.length / 4);
    };
    return {
      tokenCountFn,
      getCallCount: () => callCount,
      resetCallCount: () => {
        callCount = 0;
      },
    };
  };

  /** Creates a string of specified character length */
  const createTextOfLength = (charLength: number): string => {
    return 'a'.repeat(charLength);
  };

  /** Creates realistic text content with varied token density */
  const createRealisticText = (approximateTokens: number): string => {
    const words = [
      'the',
      'quick',
      'brown',
      'fox',
      'jumps',
      'over',
      'lazy',
      'dog',
      'lorem',
      'ipsum',
      'dolor',
      'sit',
      'amet',
      'consectetur',
      'adipiscing',
      'elit',
      'sed',
      'do',
      'eiusmod',
      'tempor',
      'incididunt',
      'ut',
      'labore',
      'et',
      'dolore',
      'magna',
      'aliqua',
      'enim',
      'ad',
      'minim',
      'veniam',
      'authentication',
      'implementation',
      'configuration',
      'documentation',
    ];
    const result: string[] = [];
    for (let i = 0; i < approximateTokens; i++) {
      result.push(words[i % words.length]);
    }
    return result.join(' ');
  };

  describe('when text is under the token limit', () => {
    it('should return original text unchanged', async () => {
      const { tokenCountFn } = createMockTokenCounter();
      const text = 'Hello, world!';
      const tokenLimit = 100;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(result.text).toBe(text);
      expect(result.wasTruncated).toBe(false);
    });

    it('should return correct token count', async () => {
      const { tokenCountFn } = createMockTokenCounter();
      const text = 'Hello, world!';
      const tokenLimit = 100;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(result.tokenCount).toBe(Math.ceil(text.length / 4));
    });

    it('should only call tokenCountFn once when under limit', async () => {
      const { tokenCountFn, getCallCount } = createMockTokenCounter();
      const text = 'Hello, world!';
      const tokenLimit = 100;

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(getCallCount()).toBe(1);
    });
  });

  describe('when text is exactly at the token limit', () => {
    it('should return original text unchanged', async () => {
      const { tokenCountFn } = createMockTokenCounter();
      const text = createTextOfLength(400);
      const tokenLimit = 100;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(result.text).toBe(text);
      expect(result.wasTruncated).toBe(false);
      expect(result.tokenCount).toBe(tokenLimit);
    });
  });

  describe('when text exceeds the token limit', () => {
    it('should truncate text to fit within limit', async () => {
      const { tokenCountFn } = createMockTokenCounter();
      const text = createTextOfLength(8000);
      const tokenLimit = 1000;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.tokenCount).toBeLessThanOrEqual(tokenLimit);
      expect(result.text.length).toBeLessThan(text.length);
    });

    it('should truncate text to be close to but not exceed the limit', async () => {
      const { tokenCountFn } = createMockTokenCounter();
      const text = createTextOfLength(8000);
      const tokenLimit = 1000;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(result.tokenCount).toBeLessThanOrEqual(tokenLimit);
      expect(result.tokenCount).toBeGreaterThan(tokenLimit * 0.9);
    });
  });

  describe('efficiency - tokenCountFn call count', () => {
    it('should call tokenCountFn at most 7 times for large text (vs ~17 for binary search)', async () => {
      const { tokenCountFn, getCallCount } = createMockTokenCounter();
      const text = createTextOfLength(400000);
      const tokenLimit = 50000;

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(getCallCount()).toBeLessThanOrEqual(7);
    });

    it('should typically call tokenCountFn only 2-3 times for standard truncation', async () => {
      const { tokenCountFn, getCallCount } = createMockTokenCounter();
      const text = createTextOfLength(40000);
      const tokenLimit = 5000;

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(getCallCount()).toBeLessThanOrEqual(3);
    });

    it('should call tokenCountFn only once when text is under limit', async () => {
      const { tokenCountFn, getCallCount } = createMockTokenCounter();
      const text = createTextOfLength(1000);
      const tokenLimit = 10000;

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(getCallCount()).toBe(1);
    });

    it('should handle very large text (100k+ tokens) efficiently', async () => {
      const { tokenCountFn, getCallCount } = createMockTokenCounter();
      const text = createTextOfLength(500000);
      const tokenLimit = 100000;

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(getCallCount()).toBeLessThanOrEqual(7);
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', async () => {
      const { tokenCountFn } = createMockTokenCounter();
      const text = '';
      const tokenLimit = 100;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(result.text).toBe('');
      expect(result.tokenCount).toBe(0);
      expect(result.wasTruncated).toBe(false);
    });

    it('should handle token limit of 1', async () => {
      const { tokenCountFn } = createMockTokenCounter();
      const text = createTextOfLength(1000);
      const tokenLimit = 1;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.tokenCount).toBeLessThanOrEqual(tokenLimit);
    });

    it('should handle text that is just slightly over the limit', async () => {
      const { tokenCountFn } = createMockTokenCounter();
      const text = createTextOfLength(404);
      const tokenLimit = 100;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn,
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.tokenCount).toBeLessThanOrEqual(tokenLimit);
    });
  });

  describe('correctness with variable token density', () => {
    it('should handle text with varying token density', async () => {
      const variableDensityTokenCounter = (text: string): number => {
        const shortWords = (text.match(/\s+/g) || []).length;
        return Math.ceil(text.length / 4) + shortWords;
      };

      const text = 'This is a test with many short words and some longer concatenated words too';
      const tokenLimit = 10;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: variableDensityTokenCounter,
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.tokenCount).toBeLessThanOrEqual(tokenLimit);
    });
  });

  describe('direct comparison with OLD binary search implementation', () => {
    it('should produce equivalent results to the old implementation', async () => {
      const oldCounter = createMockTokenCounter();
      const newCounter = createMockTokenCounter();
      const text = createTextOfLength(8000);
      const tokenLimit = 1000;

      const oldResult = await processTextWithTokenLimitOLD({
        text,
        tokenLimit,
        tokenCountFn: oldCounter.tokenCountFn,
      });

      const newResult = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: newCounter.tokenCountFn,
      });

      expect(newResult.wasTruncated).toBe(oldResult.wasTruncated);
      expect(newResult.tokenCount).toBeLessThanOrEqual(tokenLimit);
      expect(oldResult.tokenCount).toBeLessThanOrEqual(tokenLimit);
    });

    it('should use significantly fewer tokenCountFn calls than old implementation (400k chars)', async () => {
      const oldCounter = createMockTokenCounter();
      const newCounter = createMockTokenCounter();
      const text = createTextOfLength(400000);
      const tokenLimit = 50000;

      await processTextWithTokenLimitOLD({
        text,
        tokenLimit,
        tokenCountFn: oldCounter.tokenCountFn,
      });

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: newCounter.tokenCountFn,
      });

      const oldCalls = oldCounter.getCallCount();
      const newCalls = newCounter.getCallCount();

      console.log(
        `[400k chars] OLD implementation: ${oldCalls} calls, NEW implementation: ${newCalls} calls`,
      );
      console.log(`[400k chars] Reduction: ${((1 - newCalls / oldCalls) * 100).toFixed(1)}%`);

      expect(newCalls).toBeLessThan(oldCalls);
      expect(newCalls).toBeLessThanOrEqual(7);
    });

    it('should use significantly fewer tokenCountFn calls than old implementation (500k chars, 100k token limit)', async () => {
      const oldCounter = createMockTokenCounter();
      const newCounter = createMockTokenCounter();
      const text = createTextOfLength(500000);
      const tokenLimit = 100000;

      await processTextWithTokenLimitOLD({
        text,
        tokenLimit,
        tokenCountFn: oldCounter.tokenCountFn,
      });

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: newCounter.tokenCountFn,
      });

      const oldCalls = oldCounter.getCallCount();
      const newCalls = newCounter.getCallCount();

      console.log(
        `[500k chars] OLD implementation: ${oldCalls} calls, NEW implementation: ${newCalls} calls`,
      );
      console.log(`[500k chars] Reduction: ${((1 - newCalls / oldCalls) * 100).toFixed(1)}%`);

      expect(newCalls).toBeLessThan(oldCalls);
    });

    it('should achieve at least 70% reduction in tokenCountFn calls', async () => {
      const oldCounter = createMockTokenCounter();
      const newCounter = createMockTokenCounter();
      const text = createTextOfLength(500000);
      const tokenLimit = 100000;

      await processTextWithTokenLimitOLD({
        text,
        tokenLimit,
        tokenCountFn: oldCounter.tokenCountFn,
      });

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: newCounter.tokenCountFn,
      });

      const oldCalls = oldCounter.getCallCount();
      const newCalls = newCounter.getCallCount();
      const reduction = 1 - newCalls / oldCalls;

      console.log(
        `Efficiency improvement: ${(reduction * 100).toFixed(1)}% fewer tokenCountFn calls`,
      );

      expect(reduction).toBeGreaterThanOrEqual(0.7);
    });

    it('should simulate the reported scenario (122k tokens, 100k limit)', async () => {
      const oldCounter = createMockTokenCounter();
      const newCounter = createMockTokenCounter();
      const text = createTextOfLength(489564);
      const tokenLimit = 100000;

      await processTextWithTokenLimitOLD({
        text,
        tokenLimit,
        tokenCountFn: oldCounter.tokenCountFn,
      });

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: newCounter.tokenCountFn,
      });

      const oldCalls = oldCounter.getCallCount();
      const newCalls = newCounter.getCallCount();

      console.log(`[User reported scenario: ~122k tokens]`);
      console.log(`OLD implementation: ${oldCalls} tokenCountFn calls`);
      console.log(`NEW implementation: ${newCalls} tokenCountFn calls`);
      console.log(`Reduction: ${((1 - newCalls / oldCalls) * 100).toFixed(1)}%`);

      expect(newCalls).toBeLessThan(oldCalls);
      expect(newCalls).toBeLessThanOrEqual(7);
    });
  });

  describe('direct comparison with REAL tiktoken tokenizer', () => {
    beforeEach(() => {
      Tokenizer.freeAndResetAllEncoders();
    });

    it('should produce valid truncation with real tokenizer', async () => {
      const counter = createRealTokenCounter();
      const text = createRealisticText(5000);
      const tokenLimit = 1000;

      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: counter.tokenCountFn,
      });

      expect(result.wasTruncated).toBe(true);
      expect(result.tokenCount).toBeLessThanOrEqual(tokenLimit);
      expect(result.text.length).toBeLessThan(text.length);
    });

    it('should use fewer tiktoken calls than old implementation (realistic text)', async () => {
      const oldCounter = createRealTokenCounter();
      const newCounter = createRealTokenCounter();
      const text = createRealisticText(15000);
      const tokenLimit = 5000;

      await processTextWithTokenLimitOLD({
        text,
        tokenLimit,
        tokenCountFn: oldCounter.tokenCountFn,
      });

      Tokenizer.freeAndResetAllEncoders();

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: newCounter.tokenCountFn,
      });

      const oldCalls = oldCounter.getCallCount();
      const newCalls = newCounter.getCallCount();

      console.log(`[Real tiktoken ~15k tokens] OLD: ${oldCalls} calls, NEW: ${newCalls} calls`);
      console.log(`[Real tiktoken] Reduction: ${((1 - newCalls / oldCalls) * 100).toFixed(1)}%`);

      expect(newCalls).toBeLessThan(oldCalls);
    });

    it('should handle the reported user scenario with real tokenizer (~120k tokens)', async () => {
      const oldCounter = createRealTokenCounter();
      const newCounter = createRealTokenCounter();
      const text = createRealisticText(120000);
      const tokenLimit = 100000;

      const startOld = performance.now();
      await processTextWithTokenLimitOLD({
        text,
        tokenLimit,
        tokenCountFn: oldCounter.tokenCountFn,
      });
      const timeOld = performance.now() - startOld;

      Tokenizer.freeAndResetAllEncoders();

      const startNew = performance.now();
      const result = await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: newCounter.tokenCountFn,
      });
      const timeNew = performance.now() - startNew;

      const oldCalls = oldCounter.getCallCount();
      const newCalls = newCounter.getCallCount();

      console.log(`\n[REAL TIKTOKEN - User reported scenario: ~120k tokens]`);
      console.log(`OLD implementation: ${oldCalls} tiktoken calls, ${timeOld.toFixed(0)}ms`);
      console.log(`NEW implementation: ${newCalls} tiktoken calls, ${timeNew.toFixed(0)}ms`);
      console.log(`Call reduction: ${((1 - newCalls / oldCalls) * 100).toFixed(1)}%`);
      console.log(`Time reduction: ${((1 - timeNew / timeOld) * 100).toFixed(1)}%`);
      console.log(
        `Result: truncated=${result.wasTruncated}, tokens=${result.tokenCount}/${tokenLimit}\n`,
      );

      expect(newCalls).toBeLessThan(oldCalls);
      expect(result.tokenCount).toBeLessThanOrEqual(tokenLimit);
      expect(newCalls).toBeLessThanOrEqual(7);
    });

    it('should achieve at least 70% reduction with real tokenizer', async () => {
      const oldCounter = createRealTokenCounter();
      const newCounter = createRealTokenCounter();
      const text = createRealisticText(50000);
      const tokenLimit = 10000;

      await processTextWithTokenLimitOLD({
        text,
        tokenLimit,
        tokenCountFn: oldCounter.tokenCountFn,
      });

      Tokenizer.freeAndResetAllEncoders();

      await processTextWithTokenLimit({
        text,
        tokenLimit,
        tokenCountFn: newCounter.tokenCountFn,
      });

      const oldCalls = oldCounter.getCallCount();
      const newCalls = newCounter.getCallCount();
      const reduction = 1 - newCalls / oldCalls;

      console.log(
        `[Real tiktoken 50k tokens] OLD: ${oldCalls}, NEW: ${newCalls}, Reduction: ${(reduction * 100).toFixed(1)}%`,
      );

      expect(reduction).toBeGreaterThanOrEqual(0.7);
    });
  });
});
