const { encoding_for_model: encodingForModel, get_encoding: getEncoding } = require('tiktoken');
const { logger } = require('~/config');

class Tokenizer {
  constructor() {
    this.tokenizersCache = {};
    this.tokenizerCallsCount = 0;
  }

  getTokenizer(encoding, isModelName = false, extendSpecialTokens = {}) {
    let tokenizer;
    if (this.tokenizersCache[encoding]) {
      tokenizer = this.tokenizersCache[encoding];
    } else {
      if (isModelName) {
        tokenizer = encodingForModel(encoding, extendSpecialTokens);
      } else {
        tokenizer = getEncoding(encoding, extendSpecialTokens);
      }
      this.tokenizersCache[encoding] = tokenizer;
    }
    return tokenizer;
  }

  freeAndResetAllEncoders() {
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

  resetTokenizersIfNecessary() {
    if (this.tokenizerCallsCount >= 25) {
      if (this.options?.debug) {
        logger.debug('[Tokenizer] freeAndResetAllEncoders: reached 25 encodings, resetting...');
      }
      this.freeAndResetAllEncoders();
    }
    this.tokenizerCallsCount++;
  }

  getTokenCount(text, encoding = 'cl100k_base') {
    this.resetTokenizersIfNecessary();
    try {
      const tokenizer = this.getTokenizer(encoding);
      return tokenizer.encode(text, 'all').length;
    } catch (error) {
      this.freeAndResetAllEncoders();
      const tokenizer = this.getTokenizer(encoding);
      return tokenizer.encode(text, 'all').length;
    }
  }
}

const tokenizerService = new Tokenizer();

module.exports = tokenizerService;
