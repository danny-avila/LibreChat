const { sendEvent } = require('@librechat/api');
const OpenAIClient = require('~/app/clients/OpenAIClient');
const { saveMessage, saveConvo, getConvo } = require('~/models');
const addTitle = require('~/server/services/Endpoints/openAI/title');
const { codeCanDirectHandler } = require('../codeCanDirect');

jest.mock('@librechat/api', () => ({
  sendEvent: jest.fn(),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('~/app/clients/OpenAIClient', () => jest.fn());
jest.mock('~/models', () => ({
  saveMessage: jest.fn(),
  saveConvo: jest.fn(),
  getConvo: jest.fn(),
}));
jest.mock('~/server/services/Endpoints/openAI/title', () => jest.fn(() => Promise.resolve()));
jest.mock('~/server/utils', () => ({
  createOnProgress: jest.fn(() => ({
    onProgress: jest.fn(() => jest.fn()),
  })),
}));
jest.mock('~/server/services/prompts/codeCan', () => ({
  buildCodeCanSystemPrompt: jest.fn((stage) => `prompt-${stage}`),
  getCodeCanVectorStoreConfig: jest.fn(() => ({
    ontarioId: 'vs_ontario',
    nationalId: 'vs_national',
  })),
  getCodeCanVectorStoreIds: jest.fn((stage) => [stage === 'national' ? 'vs_national' : 'vs_ontario']),
  NO_RELEVANT_ONTARIO_TEXT: 'No relevant content found in the Ontario Building Code vector store.',
  NO_RELEVANT_NATIONAL_TEXT: 'No relevant content found in the National Building Code vector store.',
}));

describe('codeCanDirectHandler Ontario-first fallback', () => {
  const baseReq = {
    body: {
      text: 'What is required for exits?',
      endpointOption: {
        endpoint: 'openAI',
        endpointType: 'openAI',
        model_parameters: {
          apiKey: 'test-key',
          model: 'gpt-5-mini',
        },
      },
    },
    user: {
      id: 'user-1',
    },
    traceStep: jest.fn(),
  };

  const baseRes = {
    end: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getConvo.mockResolvedValue(null);
    saveMessage.mockResolvedValue({});
    saveConvo.mockResolvedValue({ conversationId: 'convo-1', title: null });
  });

  it('uses Ontario stage when preflight returns RELEVANT', async () => {
    const chatCompletion = jest
      .fn()
      .mockResolvedValueOnce('RELEVANT')
      .mockResolvedValueOnce({
        text: 'Ontario answer',
        raw: {
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  annotations: [
                    {
                      type: 'file_citation',
                      filename: 'ontario_page_88.json',
                      file_id: 'file-ontario',
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

    OpenAIClient.mockImplementation(() => ({
      chatCompletion,
    }));

    await codeCanDirectHandler({ ...baseReq }, { ...baseRes });

    expect(OpenAIClient).toHaveBeenCalledTimes(2);
    expect(OpenAIClient.mock.calls[1][1].modelOptions.tool_resources.file_search.vector_store_ids).toEqual([
      'vs_ontario',
    ]);
    expect(saveMessage).toHaveBeenCalledTimes(2);
    expect(sendEvent).toHaveBeenCalledTimes(2);
    expect(sendEvent.mock.calls[1][1].responseMessage.text).toBe('Ontario answer');
  });

  it('falls back to National stage when preflight returns NOT_RELEVANT', async () => {
    const chatCompletion = jest
      .fn()
      .mockResolvedValueOnce('NOT_RELEVANT')
      .mockResolvedValueOnce({
        text: 'National answer',
        raw: {
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  annotations: [
                    {
                      type: 'file_citation',
                      filename: 'nbc2020_page_15.json',
                      file_id: 'file-national',
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

    OpenAIClient.mockImplementation(() => ({
      chatCompletion,
    }));

    await codeCanDirectHandler({ ...baseReq }, { ...baseRes });

    expect(OpenAIClient).toHaveBeenCalledTimes(2);
    expect(OpenAIClient.mock.calls[1][1].modelOptions.tool_resources.file_search.vector_store_ids).toEqual([
      'vs_national',
    ]);
    expect(sendEvent.mock.calls[1][1].responseMessage.citations).toEqual([
      {
        id: 'file-national',
        page: 15,
        url: 'nbc2020_page_15.json',
      },
    ]);
  });

  it('returns deterministic no-relevant message with empty citations when fallback stage has no evidence', async () => {
    const chatCompletion = jest
      .fn()
      .mockResolvedValueOnce('NOT_RELEVANT')
      .mockResolvedValueOnce({
        text: 'No relevant content found in the National Building Code vector store.',
        raw: {
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  annotations: [],
                },
              ],
            },
          ],
        },
      });

    OpenAIClient.mockImplementation(() => ({
      chatCompletion,
    }));

    await codeCanDirectHandler({ ...baseReq }, { ...baseRes });

    expect(sendEvent.mock.calls[1][1].responseMessage.text).toBe(
      'No relevant content found in the Ontario or National Building Code files.',
    );
    expect(sendEvent.mock.calls[1][1].responseMessage.citations).toEqual([]);
    expect(addTitle).toHaveBeenCalledTimes(1);
  });
});
