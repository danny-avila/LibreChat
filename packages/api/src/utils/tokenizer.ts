import { logger } from '@librechat/data-schemas';
import * as claude from 'ai-tokenizer/encoding/claude';
import { Tokenizer as AiTokenizer } from 'ai-tokenizer';
import * as o200k_base from 'ai-tokenizer/encoding/o200k_base';

export type EncodingName = 'o200k_base' | 'claude';

const encodingData = {
  o200k_base,
  claude,
} as const;

class Tokenizer {
  private tokenizersCache: Partial<Record<EncodingName, AiTokenizer>> = {};

  getTokenizer(encoding: EncodingName = 'o200k_base'): AiTokenizer {
    const cached = this.tokenizersCache[encoding];
    if (cached) {
      return cached;
    }

    const data = encodingData[encoding];
    const tokenizer = new AiTokenizer(data);
    this.tokenizersCache[encoding] = tokenizer;
    return tokenizer;
  }

  getTokenCount(text: string, encoding: EncodingName = 'o200k_base'): number {
    try {
      const tokenizer = this.getTokenizer(encoding);
      return tokenizer.count(text);
    } catch (error) {
      logger.error('[Tokenizer] Error getting token count:', error);
      delete this.tokenizersCache[encoding];
      try {
        return this.getTokenizer(encoding).count(text);
      } catch (retryError) {
        logger.error('[Tokenizer] Recovery failed, returning 0:', retryError);
        return 0;
      }
    }
  }
}

const TokenizerSingleton = new Tokenizer();

/**
 * Counts the number of tokens in a given text using ai-tokenizer with o200k_base encoding.
 * This is an async wrapper around Tokenizer.getTokenCount for compatibility.
 */
export async function countTokens(text = ''): Promise<number> {
  return TokenizerSingleton.getTokenCount(text, 'o200k_base');
}

export default TokenizerSingleton;
