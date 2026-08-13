/**
 * Verifies that admin-configured gateway routing options (`baseURL` + `headers`
 * from `imageTools.gemini_image_gen` in librechat.yaml) are passed through to
 * the GoogleGenAI client as `httpOptions`, for both Gemini API (key) and
 * Vertex AI (service account) initialization paths.
 */

const { GoogleGenAI } = require('@google/genai');
const { loadServiceKey } = require('@librechat/api');
const createGeminiImageTool = require('../GeminiImageGen');

const mockGenerateContent = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
}));

jest.mock('@librechat/agents/langchain/tools', () => ({
  tool: (fn) => fn,
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@librechat/api', () => ({
  geminiToolkit: {
    gemini_image_gen: { name: 'gemini_image_gen', description: 'test', schema: {} },
  },
  loadServiceKey: jest.fn(),
  getBalanceConfig: jest.fn(() => ({ enabled: false })),
  getTransactionsConfig: jest.fn(() => ({ enabled: false })),
  getEnvProxyDispatcher: jest.fn(() => undefined),
}));

jest.mock('sharp', () =>
  jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ format: 'png' }),
    toFormat: jest.fn(() => ({ toBuffer: jest.fn().mockResolvedValue(Buffer.from('img')) })),
  })),
);

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(() => ({})),
}));

jest.mock('~/models', () => ({
  spendTokens: jest.fn(),
  getFiles: jest.fn(),
}));

const imageResponse = {
  candidates: [
    {
      finishReason: 'STOP',
      content: {
        parts: [{ inlineData: { data: Buffer.from('img').toString('base64') } }],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
};

describe('GeminiImageGen gateway routing (httpOptions)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateContent.mockResolvedValue(imageResponse);
  });

  it('passes baseURL and headers to GoogleGenAI as httpOptions with GEMINI_API_KEY', async () => {
    const geminiTool = createGeminiImageTool({
      isAgent: true,
      GEMINI_API_KEY: 'test-key',
      baseURL: 'https://llm-gateway.example.com',
      headers: { Authorization: 'Bearer resolved-user-token' },
    });

    await geminiTool({ prompt: 'a banana' }, {});

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'test-key',
      httpOptions: {
        baseUrl: 'https://llm-gateway.example.com',
        headers: { Authorization: 'Bearer resolved-user-token' },
      },
    });
  });

  it('passes only headers as httpOptions when no baseURL is configured', async () => {
    const geminiTool = createGeminiImageTool({
      isAgent: true,
      GOOGLE_KEY: 'google-key',
      headers: { 'X-Custom': 'value' },
    });

    await geminiTool({ prompt: 'a banana' }, {});

    expect(GoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'google-key',
      httpOptions: { headers: { 'X-Custom': 'value' } },
    });
  });

  it('omits httpOptions entirely when no gateway options are configured', async () => {
    const geminiTool = createGeminiImageTool({
      isAgent: true,
      GEMINI_API_KEY: 'test-key',
    });

    await geminiTool({ prompt: 'a banana' }, {});

    expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
    expect(GoogleGenAI.mock.calls[0][0]).not.toHaveProperty('httpOptions');
  });

  it('omits httpOptions when headers is an empty object and no baseURL is set', async () => {
    const geminiTool = createGeminiImageTool({
      isAgent: true,
      GEMINI_API_KEY: 'test-key',
      headers: {},
    });

    await geminiTool({ prompt: 'a banana' }, {});

    expect(GoogleGenAI.mock.calls[0][0]).not.toHaveProperty('httpOptions');
  });

  it('passes httpOptions on the Vertex AI service account path', async () => {
    loadServiceKey.mockResolvedValue({ project_id: 'test-project' });

    const geminiTool = createGeminiImageTool({
      isAgent: true,
      baseURL: 'https://llm-gateway.example.com',
      headers: { Authorization: 'Bearer resolved-user-token' },
    });

    await geminiTool({ prompt: 'a banana' }, {});

    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        vertexai: true,
        project: 'test-project',
        httpOptions: {
          baseUrl: 'https://llm-gateway.example.com',
          headers: { Authorization: 'Bearer resolved-user-token' },
        },
      }),
    );
  });
});
