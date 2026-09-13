import { logger } from '@librechat/data-schemas';
import { Tokenizer as AiTokenizer } from 'ai-tokenizer';

export type EncodingName = 'o200k_base' | 'claude';

type EncodingData = ConstructorParameters<typeof AiTokenizer>[0];

const MAX_TOKENIZER_INPUT_LENGTH = 4 * 1024;
/** Beyond this, an exact count is refused rather than paid for: ~60 ms/MB. */
const MAX_EXACT_COUNT_LENGTH = 8 * 1024 * 1024;

function estimateBoundedTokenCount(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function estimateUnavailableTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

function requiresTokenEstimate(text: string): boolean {
  return text.length > MAX_TOKENIZER_INPUT_LENGTH;
}

class Tokenizer {
  private tokenizersCache: Partial<Record<EncodingName, AiTokenizer>> = {};
  private loadingPromises: Partial<Record<EncodingName, Promise<void>>> = {};

  /** Pre-loads an encoding so that subsequent getTokenCount calls are accurate. */
  async initEncoding(encoding: EncodingName): Promise<void> {
    if (this.tokenizersCache[encoding]) {
      return;
    }
    if (this.loadingPromises[encoding]) {
      return this.loadingPromises[encoding];
    }
    this.loadingPromises[encoding] = (async () => {
      const data: EncodingData =
        encoding === 'claude'
          ? await import('ai-tokenizer/encoding/claude')
          : await import('ai-tokenizer/encoding/o200k_base');
      this.tokenizersCache[encoding] = new AiTokenizer(data);
    })();
    return this.loadingPromises[encoding];
  }

  /** Returns a counter that avoids expensive tokenization for oversized content. */
  async createExactTokenCounter(encoding: EncodingName): Promise<(text: string) => number> {
    await this.initEncoding(encoding);
    const tokenizer = this.tokenizersCache[encoding];
    if (!tokenizer) {
      throw new Error(`Tokenizer encoding failed to initialize: ${encoding}`);
    }
    return (text: string): number => {
      if (requiresTokenEstimate(text)) {
        return estimateBoundedTokenCount(text);
      }
      try {
        return tokenizer.count(text);
      } catch (error) {
        this.handleCountError(encoding, tokenizer, error);
        throw error;
      }
    };
  }

  getTokenCount(text: string, encoding: EncodingName = 'o200k_base'): number {
    if (requiresTokenEstimate(text)) {
      return estimateBoundedTokenCount(text);
    }
    const tokenizer = this.tokenizersCache[encoding];
    if (!tokenizer) {
      this.initEncoding(encoding);
      return estimateUnavailableTokenCount(text);
    }
    try {
      return tokenizer.count(text);
    } catch (error) {
      this.handleCountError(encoding, tokenizer, error);
      return estimateUnavailableTokenCount(text);
    }
  }

  /**
   * Token count for content that must not be estimated, or `undefined` when it
   * cannot be produced, so the caller can omit a figure instead of publishing a
   * guess. Used for a value that is ADDED to exact provider accounting — see the
   * retained tool results of a turn stopped at the tool-call limit — where
   * {@link getTokenCount}'s two fallbacks would corrupt the sum: the cold-start
   * estimate is a character ratio, and the oversized-input shortcut returns byte
   * length, several times the real count on ordinary text.
   *
   * The input is tokenized whole. Counting it in slices would be cheaper but not
   * exact — a BPE merge spanning a seam is charged twice, ~1 token per 4 KiB
   * measured — and this is the one caller that needs the real number. Whole-input
   * tokenization costs ~60 ms/MB here and runs once, at the end of a stopped
   * turn, so only absurd content is refused outright by {@link MAX_EXACT_COUNT_LENGTH}.
   */
  countExactTokens(text: string, encoding: EncodingName = 'o200k_base'): number | undefined {
    if (text.length === 0) {
      return 0;
    }
    if (text.length > MAX_EXACT_COUNT_LENGTH) {
      return undefined;
    }
    const tokenizer = this.tokenizersCache[encoding];
    if (!tokenizer) {
      void this.initEncoding(encoding);
      return undefined;
    }
    try {
      return tokenizer.count(text);
    } catch (error) {
      this.handleCountError(encoding, tokenizer, error);
      return undefined;
    }
  }

  private handleCountError(encoding: EncodingName, tokenizer: AiTokenizer, error: unknown): void {
    logger.error('[Tokenizer] Error getting token count:', error);
    if (this.tokenizersCache[encoding] !== tokenizer) {
      return;
    }
    delete this.tokenizersCache[encoding];
    delete this.loadingPromises[encoding];
    void this.initEncoding(encoding).catch((initError: unknown) => {
      logger.error(`[Tokenizer] Error reloading ${encoding} encoding:`, initError);
    });
  }
}

const TokenizerSingleton: Tokenizer = new Tokenizer();

/**
 * Counts the number of tokens in a given text using ai-tokenizer with o200k_base encoding.
 * @param text - The text to count tokens in. Defaults to an empty string.
 * @returns The number of tokens in the provided text.
 */
export async function countTokens(text = ''): Promise<number> {
  await TokenizerSingleton.initEncoding('o200k_base');
  return TokenizerSingleton.getTokenCount(text, 'o200k_base');
}

export default TokenizerSingleton;
