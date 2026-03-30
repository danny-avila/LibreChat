import { logger } from '@librechat/data-schemas';
import { Tokenizer as AiTokenizer } from 'ai-tokenizer';

export type EncodingName = 'o200k_base' | 'claude';

type EncodingData = ConstructorParameters<typeof AiTokenizer>[0];

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

  getTokenCount(text: string, encoding: EncodingName = 'o200k_base'): number {
    const tokenizer = this.tokenizersCache[encoding];
    if (!tokenizer) {
      this.initEncoding(encoding);
      return Math.ceil(text.length / 4);
    }
    try {
      return tokenizer.count(text);
    } catch (error) {
      logger.error('[Tokenizer] Error getting token count:', error);
      delete this.tokenizersCache[encoding];
      delete this.loadingPromises[encoding];
      this.initEncoding(encoding);
      return Math.ceil(text.length / 4);
    }
  }
}

const TokenizerSingleton = new Tokenizer();

export function resolveEncodingFromModel(model?: string): EncodingName {
  if (typeof model === 'string' && model.toLowerCase().includes('claude')) {
    return 'claude';
  }
  return 'o200k_base';
}

/**
 * Counts the number of tokens in a given text using ai-tokenizer with o200k_base encoding.
 * @param text - The text to count tokens in. Defaults to an empty string.
 * @param modelOrEncoding - Optional model id or explicit encoding name.
 * @returns The number of tokens in the provided text.
 */
export async function countTokens(
  text = '',
  modelOrEncoding?: string | EncodingName,
): Promise<number> {
  const encoding =
    modelOrEncoding === 'claude' || modelOrEncoding === 'o200k_base'
      ? modelOrEncoding
      : resolveEncodingFromModel(modelOrEncoding);
  await TokenizerSingleton.initEncoding(encoding);
  return TokenizerSingleton.getTokenCount(text, encoding);
}

export default TokenizerSingleton;
