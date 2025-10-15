import { logger } from '@librechat/data-schemas';
import { encoding_for_model as encodingForModel, get_encoding as getEncoding } from 'tiktoken';
import type { Tiktoken, TiktokenModel, TiktokenEncoding } from 'tiktoken';

interface TokenizerOptions {
  debug?: boolean;
}

class Tokenizer {
  tokenizersCache: Record<string, Tiktoken>;
  tokenizerCallsCount: number;
  private options?: TokenizerOptions;

  constructor() {
    this.tokenizersCache = {};
    this.tokenizerCallsCount = 0;
  }

  getTokenizer(
    encoding: TiktokenModel | TiktokenEncoding,
    isModelName = false,
    extendSpecialTokens: Record<string, number> = {},
  ): Tiktoken {
    let tokenizer: Tiktoken;
    if (this.tokenizersCache[encoding]) {
      tokenizer = this.tokenizersCache[encoding];
    } else {
      if (isModelName) {
        tokenizer = encodingForModel(encoding as TiktokenModel, extendSpecialTokens);
      } else {
        tokenizer = getEncoding(encoding as TiktokenEncoding, extendSpecialTokens);
      }
      this.tokenizersCache[encoding] = tokenizer;
    }
    return tokenizer;
  }

  freeAndResetAllEncoders(): void {
    try {
      Object.keys(this.tokenizersCache).forEach((key) => {
        if (this.tokenizersCache[key]) {
          this.tokenizersCache[key].free();
          delete this.tokenizersCache[key];
        }
      });
      this.tokenizerCallsCount = 1;
    } catch (error) {
      logger.error('[Tokenizer] Free and reset encoders error', error);
    }
  }

  resetTokenizersIfNecessary(): void {
    if (this.tokenizerCallsCount >= 25) {
      if (this.options?.debug) {
        logger.debug('[Tokenizer] freeAndResetAllEncoders: reached 25 encodings, resetting...');
      }
      this.freeAndResetAllEncoders();
    }
    this.tokenizerCallsCount++;
  }

  getTokenCount(text: string, encoding: TiktokenModel | TiktokenEncoding = 'cl100k_base'): number {
    this.resetTokenizersIfNecessary();
    try {
      const tokenizer = this.getTokenizer(encoding);
      return tokenizer.encode(text, 'all').length;
    } catch (error) {
      logger.error('[Tokenizer] Error getting token count:', error);
      this.freeAndResetAllEncoders();
      const tokenizer = this.getTokenizer(encoding);
      return tokenizer.encode(text, 'all').length;
    }
  }
}

const TokenizerSingleton = new Tokenizer();

export default TokenizerSingleton;
