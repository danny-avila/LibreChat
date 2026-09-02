const { logger } = require('@librechat/data-schemas');
const { getBalanceConfig, getTransactionsConfig } = require('@librechat/api');
const { spendTokens } = require('~/models');
const {
  resolveImagePricing,
  extractImageUsage,
  calculateImageCredits,
  recordOpenAIImageUsage,
} = require('./OpenAIImageBilling');

jest.mock('@librechat/data-schemas', () => ({
  logger: { warn: jest.fn() },
}));
jest.mock('@librechat/api', () => ({
  getBalanceConfig: jest.fn(() => ({ enabled: true })),
  getTransactionsConfig: jest.fn(() => ({ enabled: true })),
}));
jest.mock('~/models', () => ({
  spendTokens: jest.fn(),
}));

describe('OpenAIImageBilling', () => {
  const originalMultiplier = process.env.IMAGE_GEN_OAI_BILLING_MULTIPLIER;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.IMAGE_GEN_OAI_BILLING_MULTIPLIER;
  });

  afterAll(() => {
    if (originalMultiplier == null) {
      delete process.env.IMAGE_GEN_OAI_BILLING_MULTIPLIER;
    } else {
      process.env.IMAGE_GEN_OAI_BILLING_MULTIPLIER = originalMultiplier;
    }
  });

  it('calculates gpt-image-2 text-to-image credits from real usage', () => {
    expect(
      calculateImageCredits({
        model: 'gpt-image-2',
        usage: {
          input_tokens: 100,
          input_tokens_details: { text_tokens: 100, image_tokens: 0 },
          output_tokens: 200,
        },
      }),
    ).toBe(6500);
  });

  it('calculates image edit credits from text, image, and output tokens', () => {
    expect(
      calculateImageCredits({
        model: 'gpt-image-2',
        usage: {
          input_tokens_details: { text_tokens: 10, image_tokens: 20 },
          output_tokens: 30,
        },
      }),
    ).toBe(1110);
  });

  it('falls back to input tokens minus image tokens for text usage', () => {
    expect(
      extractImageUsage({
        input_tokens: 40,
        input_tokens_details: { image_tokens: 15 },
        output_tokens: 5,
      }),
    ).toEqual({ textTokens: 25, imageTokens: 15, outputTokens: 5 });
  });

  it('matches snapshot model names', () => {
    expect(resolveImagePricing('gpt-image-2-2026-04-16')).toEqual({
      textInput: 5,
      imageInput: 8,
      imageOutput: 30,
    });
  });

  it('does not match gpt-image-1-mini as gpt-image-1', () => {
    expect(resolveImagePricing('gpt-image-1-mini-2025-10-06')).toEqual({
      textInput: 2,
      imageInput: 2.5,
      imageOutput: 8,
    });
  });

  it('does not charge an unknown model', () => {
    expect(calculateImageCredits({ model: 'unknown', usage: { output_tokens: 10 } })).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not charge when usage is missing', () => {
    expect(calculateImageCredits({ model: 'gpt-image-2' })).toBeNull();
  });

  it('applies IMAGE_GEN_OAI_BILLING_MULTIPLIER and rounds up', () => {
    process.env.IMAGE_GEN_OAI_BILLING_MULTIPLIER = '1.5';
    expect(
      calculateImageCredits({
        model: 'gpt-image-1-mini',
        usage: { input_tokens_details: { image_tokens: 1 }, output_tokens: 0 },
      }),
    ).toBe(4);
  });

  it('records calculated credits through spendTokens at a fixed rate of one', async () => {
    const req = { user: { id: 'user-1' }, config: { balance: { enabled: true } } };
    await recordOpenAIImageUsage({
      req,
      model: 'gpt-image-2',
      usage: { input_tokens_details: { text_tokens: 2 }, output_tokens: 3 },
      conversationId: 'conversation-1',
      messageId: 'message-1',
    });

    expect(getBalanceConfig).toHaveBeenCalledWith(req.config);
    expect(getTransactionsConfig).toHaveBeenCalledWith(req.config);
    expect(spendTokens).toHaveBeenCalledWith(
      {
        user: 'user-1',
        model: 'gpt-image-2',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        context: 'image_generation',
        balance: { enabled: true },
        transactions: { enabled: true },
        endpointTokenConfig: { 'gpt-image-2': { completion: 1 } },
      },
      { completionTokens: 100 },
    );
  });
});
