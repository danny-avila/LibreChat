import { logger } from '@librechat/data-schemas';
import { Tokenizer as AiTokenizer } from 'ai-tokenizer';

export type EncodingName = 'o200k_base' | 'claude';

type EncodingData = ConstructorParameters<typeof AiTokenizer>[0];

const MAX_TOKENIZER_INPUT_LENGTH = 4 * 1024;

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
