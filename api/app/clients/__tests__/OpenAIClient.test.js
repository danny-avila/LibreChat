jest.mock('@librechat/data-schemas', () => ({
  createMethods: jest.fn(() => ({})),
  createModels: jest.fn(() => ({})),
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('@librechat/agents', () => ({
  sleep: jest.fn(),
  SplitStreamHandler: jest.fn(),
  CustomOpenAIClient: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn(),
  Tokenizer: jest.fn(),
  createFetch: jest.fn(),
  createAxiosInstance: jest.fn(() => ({
    post: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
  })),
  logAxiosError: jest.fn(),
  resolveHeaders: jest.fn(() => ({})),
  constructAzureURL: jest.fn(),
  getModelMaxTokens: jest.fn(),
  genAzureChatCompletion: jest.fn(),
  getModelMaxOutputTokens: jest.fn(),
  createStreamEventHandlers: jest.fn(),
}));
jest.mock('../tools/util', () => ({
  handleOpenAIErrors: jest.fn(),
}));
jest.mock('../prompts', () => ({
  truncateText: jest.fn(),
  formatMessage: jest.fn(),
  CUT_OFF_PROMPT: '',
  titleInstruction: '',
  createContextHandlers: jest.fn(),
}));
jest.mock('~/server/services/Files/images/encode', () => ({
  encodeAndFormat: jest.fn(),
}));
jest.mock('~/models/spendTokens', () => ({
  spendTokens: jest.fn(),
}));
jest.mock('~/server/utils', () => ({
  addSpaceIfNeeded: jest.fn(),
}));
jest.mock('../OllamaClient', () => ({
  OllamaClient: jest.fn(),
}));
jest.mock('../memory', () => ({
  summaryBuffer: jest.fn(),
}));
jest.mock('../chains', () => ({
  runTitleChain: jest.fn(),
}));
jest.mock('~/utils', () => ({
  extractBaseURL: jest.fn(),
}));
jest.mock('../document', () => ({
  tokenSplit: jest.fn(),
}));
jest.mock('../BaseClient', () =>
  class BaseClient {
    constructor(apiKey, options = {}) {
      this.apiKey = apiKey;
      this.options = options;
      this.modelOptions = options.modelOptions ?? {};
      this.checkVisionRequest = jest.fn();
      this.setHeaders = {};
      this.useOpenRouter = false;
    }
  },
);

describe('OpenAIClient buildResponsesRequest', () => {
  const originalEnv = { ...process.env };
  const loadClient = () => {
    jest.resetModules();
    return require('../OpenAIClient');
  };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('uses the National default vector store when no env vars are set', () => {
    delete process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID;
    delete process.env.CODECAN_OPENAI_VECTOR_STORE_ID;
    const OpenAIClient = loadClient();
    const client = new OpenAIClient('test-key', { codeCanFileId: 'file-test' });
    const req = client.buildResponsesRequest({ model: 'gpt-5' }, [{ content: 'hi' }], false);
    expect(req.tools).toEqual([
      { type: 'file_search', vector_store_ids: ['vs_693860848bc48191bccb7c1d197f488f'] },
    ]);
  });

  it('uses legacy CODECAN_OPENAI_VECTOR_STORE_ID as National fallback when new National env is missing', () => {
    process.env.CODECAN_OPENAI_VECTOR_STORE_ID = 'vs_legacy_national';
    delete process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID;
    const OpenAIClient = loadClient();
    const client = new OpenAIClient('test-key');
    const req = client.buildResponsesRequest({ model: 'gpt-5' }, [{ content: 'hi' }], false);
    expect(req.tools).toEqual([
      { type: 'file_search', vector_store_ids: ['vs_legacy_national'] },
    ]);
  });

  it('prefers CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID over legacy vector store env', () => {
    process.env.CODECAN_OPENAI_VECTOR_STORE_ID = 'vs_legacy_national';
    process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID = 'vs_national_override';
    const OpenAIClient = loadClient();
    const client = new OpenAIClient('test-key');
    const req = client.buildResponsesRequest({ model: 'gpt-5' }, [{ content: 'hi' }], false);
    expect(req.tools).toEqual([
      { type: 'file_search', vector_store_ids: ['vs_national_override'] },
    ]);
  });

  it('respects explicit modelOptions.tool_resources vector store ids over defaults', () => {
    process.env.CODECAN_OPENAI_NATIONAL_VECTOR_STORE_ID = 'vs_national_override';
    const OpenAIClient = loadClient();
    const client = new OpenAIClient('test-key');
    const req = client.buildResponsesRequest(
      {
        model: 'gpt-5',
        tool_resources: {
          file_search: { vector_store_ids: ['vs_explicit'] },
        },
      },
      [{ content: 'hi' }],
      false,
    );
    expect(req.tools).toEqual([{ type: 'file_search', vector_store_ids: ['vs_explicit'] }]);
    expect(req.tool_resources).toBeUndefined();
  });
});
