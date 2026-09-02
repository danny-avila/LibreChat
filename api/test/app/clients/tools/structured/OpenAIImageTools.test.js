const axios = require('axios');
const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');
const { recordOpenAIImageUsage } = require('~/server/services/Billing/OpenAIImageBilling');
const createOpenAIImageTools = require('~/app/clients/tools/structured/OpenAIImageTools');

jest.mock('axios');
jest.mock('openai');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(),
  oaiToolkit: {
    image_gen_oai: {
      name: 'image_gen_oai',
      description: 'Generate an image',
      schema: {},
    },
    image_edit_oai: {
      name: 'image_edit_oai',
      description: 'Edit an image',
      schema: {},
    },
  },
  extractBaseURL: jest.fn((url) => url),
  getProxyDispatcher: jest.fn(() => undefined),
  applyAxiosProxyConfig: jest.fn(),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({
    getDownloadStream: jest.fn(() => Promise.resolve(require('stream').Readable.from(['image']))),
  })),
}));

jest.mock('~/server/services/Billing/OpenAIImageBilling', () => ({
  recordOpenAIImageUsage: jest.fn(() => Promise.resolve()),
}));

jest.mock('~/models', () => ({
  getFiles: jest.fn().mockResolvedValue([]),
}));

describe('OpenAIImageTools - IMAGE_GEN_OAI_MODEL environment variable', () => {
  let originalEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = { ...process.env };

    process.env.IMAGE_GEN_OAI_API_KEY = 'test-api-key';

    OpenAI.mockImplementation(() => ({
      images: {
        generate: jest.fn().mockResolvedValue({
          data: [
            {
              b64_json: 'base64-encoded-image-data',
            },
          ],
        }),
      },
    }));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default model "gpt-image-1" when IMAGE_GEN_OAI_MODEL is not set', async () => {
    delete process.env.IMAGE_GEN_OAI_MODEL;

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      override: false,
      req: { user: { id: 'test-user' } },
    });

    const mockGenerate = jest.fn().mockResolvedValue({
      data: [
        {
          b64_json: 'base64-encoded-image-data',
        },
      ],
    });

    OpenAI.mockImplementation(() => ({
      images: {
        generate: mockGenerate,
      },
    }));

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-1',
      }),
      expect.any(Object),
    );
  });

  it('should use "gpt-image-1.5" when IMAGE_GEN_OAI_MODEL is set to "gpt-image-1.5"', async () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-1.5';

    const mockGenerate = jest.fn().mockResolvedValue({
      data: [
        {
          b64_json: 'base64-encoded-image-data',
        },
      ],
    });

    OpenAI.mockImplementation(() => ({
      images: {
        generate: mockGenerate,
      },
    }));

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      override: false,
      req: { user: { id: 'test-user' } },
    });

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-image-1.5',
      }),
      expect.any(Object),
    );
  });

  it('should use custom model name from IMAGE_GEN_OAI_MODEL environment variable', async () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'custom-image-model';

    const mockGenerate = jest.fn().mockResolvedValue({
      data: [
        {
          b64_json: 'base64-encoded-image-data',
        },
      ],
    });

    OpenAI.mockImplementation(() => ({
      images: {
        generate: mockGenerate,
      },
    }));

    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      override: false,
      req: { user: { id: 'test-user' } },
    });

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'custom-image-model',
      }),
      expect.any(Object),
    );
  });

  it('records generation usage after receiving valid image data', async () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-2';
    const usage = { input_tokens: 10, output_tokens: 20 };
    OpenAI.mockImplementation(() => ({
      images: {
        generate: jest.fn().mockResolvedValue({
          data: [{ b64_json: 'base64-encoded-image-data' }],
          usage,
        }),
      },
    }));
    const req = { user: { id: 'test-user' } };
    const [imageGenTool] = createOpenAIImageTools({ isAgent: true, req });

    await imageGenTool.func({ prompt: 'test prompt' }, undefined, {
      configurable: {
        thread_id: 'conversation-1',
        run_id: 'run-1',
        requestBody: { messageId: 'fallback-message' },
      },
    });

    expect(recordOpenAIImageUsage).toHaveBeenCalledWith({
      req,
      model: 'gpt-image-2',
      usage,
      conversationId: 'conversation-1',
      messageId: 'run-1',
    });
  });

  it('records edit usage after receiving valid image data', async () => {
    process.env.IMAGE_GEN_OAI_MODEL = 'gpt-image-2';
    const usage = {
      input_tokens_details: { text_tokens: 10, image_tokens: 20 },
      output_tokens: 30,
    };
    axios.post.mockResolvedValue({
      data: { data: [{ b64_json: 'edited-image' }], usage },
    });
    const req = { user: { id: 'test-user' } };
    const [, imageEditTool] = createOpenAIImageTools({
      isAgent: true,
      req,
      fileStrategy: 'local',
      imageFiles: [
        {
          file_id: 'image-1',
          filepath: '/image.png',
          filename: 'image.png',
          type: 'image/png',
          source: 'local',
        },
      ],
    });

    await imageEditTool.func({ prompt: 'edit it', image_ids: ['image-1'] }, undefined, {
      configurable: {
        thread_id: 'conversation-2',
        requestBody: { messageId: 'message-2' },
      },
    });

    expect(recordOpenAIImageUsage).toHaveBeenCalledWith({
      req,
      model: 'gpt-image-2',
      usage,
      conversationId: 'conversation-2',
      messageId: 'message-2',
    });
  });

  it('does not record usage when no valid image is returned', async () => {
    OpenAI.mockImplementation(() => ({
      images: {
        generate: jest.fn().mockResolvedValue({ data: [], usage: { output_tokens: 20 } }),
      },
    }));
    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      req: { user: { id: 'test-user' } },
    });

    await imageGenTool.func({ prompt: 'test prompt' });

    expect(recordOpenAIImageUsage).not.toHaveBeenCalled();
  });

  it('returns the image when asynchronous billing fails', async () => {
    recordOpenAIImageUsage.mockRejectedValueOnce(new Error('billing failed'));
    const [imageGenTool] = createOpenAIImageTools({
      isAgent: true,
      req: { user: { id: 'test-user' } },
    });

    const result = await imageGenTool.func({ prompt: 'test prompt' });
    await new Promise(setImmediate);

    expect(result[1].content[0].image_url.url).toContain('base64-encoded-image-data');
    expect(logger.error).toHaveBeenCalledWith(
      '[ImageGenOAI] Failed to record image usage:',
      expect.any(Error),
    );
  });
});
