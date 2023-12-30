const { Tiktoken } = require('tiktoken/lite');
const p50k_base = require('tiktoken/encoders/p50k_base.json');
const cl100k_base = require('tiktoken/encoders/cl100k_base.json');
const logger = require('~/config/winston');

const countTokens = async (text = '', modelName = 'gpt-3.5-turbo') => {
  let encoder = null;
  try {
    const model = modelName.includes('text-davinci-003') ? p50k_base : cl100k_base;
    encoder = new Tiktoken(model.bpe_ranks, model.special_tokens, model.pat_str);
    const tokens = encoder.encode(text);
    encoder.free();
    return tokens.length;
  } catch (e) {
    logger.error('[countTokens]', e);
    if (encoder) {
      encoder.free();
    }
    return 0;
  }
};

module.exports = countTokens;
