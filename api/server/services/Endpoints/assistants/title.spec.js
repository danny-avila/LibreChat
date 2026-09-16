const { sanitizeTitle } = require('@librechat/api');

jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(() => true),
  sanitizeTitle: jest.fn((value) => value),
}));
jest.mock('@librechat/data-schemas', () => ({ logger: { error: jest.fn() } }));
jest.mock('librechat-data-provider', () => ({ CacheKeys: { GEN_TITLE: 'gen-title' } }));
jest.mock('~/cache/getLogStores', () => jest.fn(() => ({ set: jest.fn() })));
jest.mock('./initalize', () => jest.fn());
jest.mock('~/models', () => ({ saveConvo: jest.fn() }));
jest.mock('~/server/services/Threads', () => ({ recordUsage: jest.fn() }));

const initializeClient = require('./initalize');
const addTitle = require('./title');

describe('Assistants title generation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the Responses API with the routine nano model and records Responses usage fields', async () => {
    const responses = {
      create: jest.fn().mockResolvedValue({
        output_text: 'Matter strategy',
        model: 'gpt-5.4-nano',
        usage: { input_tokens: 12, output_tokens: 4 },
      }),
    };
    initializeClient.mockResolvedValue({ openai: { responses } });

    await addTitle(
      { user: { id: 'user-1' }, body: {}, config: {} },
      { text: 'How should we approach discovery?', responseText: 'Start with the requests.', conversationId: 'conv-1' },
    );

    expect(initializeClient).toHaveBeenCalled();
    expect(responses.create).toHaveBeenCalledWith({
      model: 'gpt-5.4-nano',
      input: expect.stringContaining('How should we approach discovery?'),
      max_output_tokens: 20,
      store: false,
    });
    expect(sanitizeTitle).toHaveBeenCalledWith('Matter strategy');
  });
});
