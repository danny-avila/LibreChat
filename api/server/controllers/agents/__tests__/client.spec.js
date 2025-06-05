jest.mock('@librechat/agents', () => ({
  Callback: {
    TOOL_ERROR: 'TOOL_ERROR',
  },
  GraphEvents: {
    ON_AGENT_UPDATE: 'on_agent_update',
  },
  formatMessage: jest.fn((params) => ({
    ...params.message,
    content: params.message.text || params.message.content,
  })),
  formatAgentMessages: jest.fn((payload, indexMap) => ({
    messages: payload || [],
    indexTokenCountMap: indexMap || {},
  })),
  formatContentStrings: jest.fn((messages) => messages),
  getTokenCountForMessage: jest.fn(() => 10),
  createMetadataAggregator: jest.fn(() => ({
    handleLLMEnd: jest.fn(),
    collected: [],
  })),
}));

jest.mock('librechat-data-provider', () => ({
  Constants: {
    CURRENT_MODEL: 'current',
  },
  VisionModes: {
    agents: 'agents',
  },
  ContentTypes: {
    AGENT_UPDATE: 'agent_update',
    TOOL_CALL: 'tool_call',
    ERROR: 'error',
  },
  EModelEndpoint: {
    agents: 'agents',
    azureOpenAI: 'azureOpenAI',
    bedrock: 'bedrock',
  },
  KnownEndpoints: {
    groq: 'groq',
    deepseek: 'deepseek',
  },
  isAgentsEndpoint: jest.fn((endpoint) => endpoint === 'agents'),
  AgentCapabilities: {
    chain: 'chain',
  },
  bedrockInputSchema: {
    parse: jest.fn((params) => params),
  },
  removeNullishValues: jest.fn((obj) => obj),
}));

jest.mock('~/server/services/Config', () => ({
  getCustomEndpointConfig: jest.fn().mockResolvedValue(null),
  checkCapability: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('~/app/clients/prompts', () => ({
  addCacheControl: jest.fn((messages) => messages),
  createContextHandlers: jest.fn(() => ({
    processFile: jest.fn(),
    createContext: jest.fn().mockResolvedValue('augmented context'),
  })),
}));

jest.mock('~/models', () => ({
  getMessages: jest.fn(),
  saveMessage: jest.fn(),
  updateMessage: jest.fn(),
  saveConvo: jest.fn(),
  getConvo: jest.fn(),
}));

jest.mock('~/models/balanceMethods', () => ({
  checkBalance: jest.fn(),
}));

jest.mock('~/models/File', () => ({
  getFiles: jest.fn(),
}));

jest.mock('~/models/spendTokens', () => ({
  spendTokens: jest.fn().mockResolvedValue({}),
  spendStructuredTokens: jest.fn().mockResolvedValue({}),
}));

jest.mock('@langchain/core/messages', () => ({
  getBufferString: jest.fn(() => 'buffer string'),
  HumanMessage: jest.fn(function (content) {
    this.content = content;
    this._getType = () => 'human';
  }),
}));

jest.mock('~/server/services/Files/images/encode', () => ({
  encodeAndFormat: jest.fn().mockResolvedValue({
    files: [],
    text: 'ocr text',
    image_urls: ['http://example.com/image.jpg'],
  }),
}));

jest.mock('~/server/services/Endpoints/openAI/initialize', () => jest.fn());

jest.mock('~/server/services/Tokenizer', () => ({
  getTokenCount: jest.fn(() => 10),
}));

jest.mock('~/app/clients/prompts/truncate', () => ({
  truncateToolCallOutputs: jest.fn((x) => x),
}));

jest.mock('~/server/utils', () => ({
  addSpaceIfNeeded: jest.fn((x) => x),
}));

jest.mock('~/app/clients/TextStream', () => {
  return jest.fn();
});

jest.mock('~/app/clients/BaseClient');

jest.mock('~/config', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  sendEvent: jest.fn(),
}));

jest.mock('../run', () => ({
  createRun: jest.fn(),
}));

const BaseClient = require('~/app/clients/BaseClient');
const AgentClient = require('../client');
const { createRun } = require('../run');
const { sendEvent } = require('~/config');
const { spendTokens, spendStructuredTokens } = require('~/models/spendTokens');
const { encodeAndFormat } = require('~/server/services/Files/images/encode');
const { addCacheControl, createContextHandlers } = require('~/app/clients/prompts');
const { getCustomEndpointConfig, checkCapability } = require('~/server/services/Config');
const { formatAgentMessages, createMetadataAggregator } = require('@librechat/agents');
const { bedrockInputSchema, isAgentsEndpoint, ContentTypes } = require('librechat-data-provider');
const Tokenizer = require('~/server/services/Tokenizer');

describe('AgentClient', () => {
  let mockOptions;
  let mockReq;
  let mockRes;
  let mockAgent;
  let agentClient;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRes = {
      write: jest.fn(),
    };

    mockReq = {
      user: { id: 'user123' },
      body: {
        text: 'user message',
        endpointOption: {
          model_parameters: { model: 'test-model' },
        },
      },
      app: {
        locals: {
          agents: {
            recursionLimit: 50,
            maxRecursionLimit: 100,
          },
        },
      },
    };

    mockAgent = {
      id: 'agent123',
      name: 'Test Agent',
      provider: 'openAI',
      endpoint: 'openAI',
      model_parameters: {
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 1000,
      },
      tools: [{ name: 'tool1' }, { name: 'tool2' }],
      instructions: 'Agent instructions',
      additional_instructions: 'Additional instructions',
      hide_sequential_outputs: false,
      recursion_limit: 25,
    };

    mockOptions = {
      req: mockReq,
      res: mockRes,
      agent: mockAgent,
      endpoint: 'agents',
      modelLabel: 'Test Model',
      maxContextTokens: 4000,
      resendFiles: false,
      imageDetail: 'auto',
      spec: 'test-spec',
      iconURL: 'https://example.com/icon.png',
      name: 'User',
      attachments: Promise.resolve([]),
      endpointTokenConfig: {},
      eventHandlers: {},
      aggregateContent: jest.fn(),
      agentConfigs: new Map(),
      contentParts: [],
      collectedUsage: [],
      artifactPromises: {},
    };

    BaseClient.getMessagesForConversation = jest.fn(() => [
      { messageId: 'msg1', role: 'user', text: 'Hello', tokenCount: 5 },
      { messageId: 'msg2', role: 'assistant', text: 'Hi there', tokenCount: 5 },
    ]);

    agentClient = new AgentClient(mockOptions);
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(agentClient.clientName).toBe('agents');
      expect(agentClient.contextStrategy).toBe('discard');
      expect(agentClient.isChatCompletion).toBe(true);
      expect(agentClient.model).toBe('gpt-4');
      expect(agentClient.inputTokensKey).toBe('input_tokens');
      expect(agentClient.outputTokensKey).toBe('output_tokens');
      expect(agentClient.options.endpoint).toBe('agents');
      expect(agentClient.agentConfigs).toBe(mockOptions.agentConfigs);
      expect(agentClient.maxContextTokens).toBe(4000);
      expect(agentClient.contentParts).toBe(mockOptions.contentParts);
      expect(agentClient.collectedUsage).toBe(mockOptions.collectedUsage);
      expect(agentClient.artifactPromises).toBe(mockOptions.artifactPromises);
    });
  });

  describe('getContentParts', () => {
    it('should return content parts', () => {
      const contentParts = [{ type: 'text', text: 'content' }];
      agentClient.contentParts = contentParts;
      expect(agentClient.getContentParts()).toBe(contentParts);
    });
  });

  describe('setOptions', () => {
    it('should log options info', () => {
      const options = { test: 'value' };
      agentClient.setOptions(options);
      expect(require('~/config').logger.info).toHaveBeenCalledWith(
        '[api/server/controllers/agents/client.js] setOptions',
        options,
      );
    });
  });

  describe('checkVisionRequest', () => {
    it('should be a no-op function', () => {
      expect(() => agentClient.checkVisionRequest([{ type: 'image/png' }])).not.toThrow();
    });
  });

  describe('getSaveOptions', () => {
    const saveOptionsTestCases = [
      {
        name: 'should return save options for agents endpoint',
        setup: () => {},
        verify: (result) => {
          expect(result).toEqual({
            endpoint: 'agents',
            agent_id: 'agent123',
            modelLabel: 'Test Model',
            maxContextTokens: undefined,
            resendFiles: false,
            imageDetail: 'auto',
            spec: 'test-spec',
            iconURL: 'https://example.com/icon.png',
            model: undefined,
          });
        },
      },
      {
        name: 'should parse bedrock endpoint options',
        setup: () => {
          agentClient.options.endpoint = 'bedrock';
          agentClient.options.agent.endpoint = 'bedrock';
        },
        verify: (_result) => {
          expect(bedrockInputSchema.parse).toHaveBeenCalledWith(mockAgent.model_parameters);
        },
      },
      {
        name: 'should handle parsing errors gracefully',
        setup: () => {
          agentClient.options.endpoint = 'bedrock';
          agentClient.options.agent.endpoint = 'bedrock';
          isAgentsEndpoint.mockReturnValueOnce(false);
          bedrockInputSchema.parse.mockImplementationOnce(() => {
            throw new Error('Parse error');
          });
        },
        verify: (result) => {
          expect(require('~/config').logger.error).toHaveBeenCalled();
          expect(result).toBeDefined();
        },
      },
    ];

    saveOptionsTestCases.forEach(({ name, setup, verify }) => {
      it(`${name}`, () => {
        setup();
        const result = agentClient.getSaveOptions();
        verify(result);
        expect(true).toBe(true);
      });
    });
  });

  describe('getBuildMessagesOptions', () => {
    it('should return agent instructions', () => {
      const result = agentClient.getBuildMessagesOptions();
      expect(result).toEqual({
        instructions: 'Agent instructions',
        additional_instructions: 'Additional instructions',
      });
    });
  });

  describe('addImageURLs', () => {
    it('should add image URLs and OCR text to message', async () => {
      const message = {};
      const attachments = [{ type: 'image/png' }];

      const result = await agentClient.addImageURLs(message, attachments);

      expect(encodeAndFormat).toHaveBeenCalledWith(mockReq, attachments, 'openAI', 'agents');
      expect(message.image_urls).toEqual(['http://example.com/image.jpg']);
      expect(message.ocr).toBe('ocr text');
      expect(result).toEqual([]);
    });
  });

  describe('buildMessages', () => {
    beforeEach(() => {
      agentClient.getTokenCountForMessage = jest.fn(() => 10);
      agentClient.handleContextStrategy = jest.fn().mockResolvedValue({
        payload: [],
        promptTokens: 0,
        tokenCountMap: {},
        messages: BaseClient.getMessagesForConversation(),
      });
    });

    it('should build messages with basic configuration', async () => {
      const messages = [
        { messageId: 'msg1', role: 'user', text: 'Hello' },
        { messageId: 'msg2', role: 'assistant', text: 'Hi there' },
      ];
      const parentMessageId = 'parent123';

      const result = await agentClient.buildMessages(messages, parentMessageId, {});

      expect(BaseClient.getMessagesForConversation).toHaveBeenCalledWith({
        messages,
        parentMessageId,
        summary: undefined,
      });
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('messages');
      expect(result).toHaveProperty('tokenCountMap');
      expect(result).toHaveProperty('promptTokens');
    });

    it('should handle attachments and create message file map', async () => {
      const attachment = { type: 'image/png', embedded: false };
      mockOptions.attachments = Promise.resolve([attachment]);
      agentClient = new AgentClient(mockOptions);
      agentClient.getTokenCountForMessage = jest.fn(() => 10);
      agentClient.handleContextStrategy = jest.fn().mockResolvedValue({
        payload: [],
        promptTokens: 0,
        tokenCountMap: {},
        messages: BaseClient.getMessagesForConversation(),
      });

      const messages = [
        { messageId: 'msg1', role: 'user', text: 'Hello' },
        { messageId: 'msg2', role: 'assistant', text: 'Hi there' },
      ];
      await agentClient.buildMessages(messages, 'parent123', {});

      expect(agentClient.message_file_map).toEqual({
        msg2: [attachment],
      });
      expect(encodeAndFormat).toHaveBeenCalled();
    });

    it('should create context handlers for non-agent endpoints', async () => {
      agentClient.options.endpoint = 'openAI';
      agentClient.message_file_map = { msg1: [{ embedded: true }] };
      agentClient.getTokenCountForMessage = jest.fn(() => 10);
      agentClient.handleContextStrategy = jest.fn().mockResolvedValue({
        payload: [],
        promptTokens: 0,
        tokenCountMap: {},
        messages: BaseClient.getMessagesForConversation(),
      });

      await agentClient.buildMessages(
        [{ messageId: 'msg1', role: 'user', text: 'Hello' }],
        'parent123',
        {},
      );

      expect(createContextHandlers).toHaveBeenCalledWith(mockReq, 'Hi there');
      expect(agentClient.augmentedPrompt).toBe('augmented context');
    });

    it('should handle OCR text in messages', async () => {
      const messages = [
        { messageId: 'msg1', role: 'user', text: 'Hello', ocr: 'OCR content' },
        { messageId: 'msg2', role: 'user', text: 'World', ocr: 'More OCR' },
      ];
      BaseClient.getMessagesForConversation.mockReturnValueOnce(messages);
      agentClient.getTokenCountForMessage = jest.fn(() => 10);
      agentClient.handleContextStrategy = jest.fn().mockResolvedValue({
        payload: [],
        promptTokens: 0,
        tokenCountMap: {},
        messages,
      });

      await agentClient.buildMessages(messages, 'parent123', {});

      expect(agentClient.options.agent.instructions).toBe('\nocr text');
    });

    it('should handle context strategy token counting', async () => {
      agentClient.contextStrategy = 'summarize';
      agentClient.handleContextStrategy = jest.fn().mockResolvedValue({
        payload: 'processed',
        promptTokens: 100,
        tokenCountMap: { msg1: 50 },
        messages: [{ messageId: 'msg1', tokenCount: 50 }],
      });

      const result = await agentClient.buildMessages([], 'parent123', {});

      expect(agentClient.handleContextStrategy).toHaveBeenCalled();
      expect(result.promptTokens).toBe(100);
      expect(agentClient.indexTokenCountMap).toEqual({ 0: 50 });
    });

    it('should call getReqData callback if provided', async () => {
      const getReqData = jest.fn();
      agentClient.contextStrategy = 'discard';
      agentClient.handleContextStrategy = jest.fn().mockResolvedValue({
        payload: 'processed',
        promptTokens: 100,
        tokenCountMap: {},
        messages: [],
      });

      await agentClient.buildMessages([], 'parent123', {}, { getReqData });

      expect(getReqData).toHaveBeenCalledWith({ promptTokens: 100 });
    });
  });

  describe('sendCompletion', () => {
    it('should call chatCompletion and return content parts', async () => {
      agentClient.chatCompletion = jest.fn().mockResolvedValue();
      const payload = { messages: [] };
      const opts = { onProgress: jest.fn(), abortController: new AbortController() };

      const result = await agentClient.sendCompletion(payload, opts);

      expect(agentClient.chatCompletion).toHaveBeenCalledWith({
        payload,
        onProgress: opts.onProgress,
        abortController: opts.abortController,
      });
      expect(result).toBe(agentClient.contentParts);
    });
  });

  describe('recordCollectedUsage', () => {
    const usageTestCases = [
      {
        name: 'should record simple usage',
        collectedUsage: [{ input_tokens: 100, output_tokens: 50, model: 'gpt-4' }],
        expectedCalls: [
          {
            method: 'spendTokens',
            args: [
              expect.objectContaining({
                context: 'message',
                conversationId: undefined,
                model: 'gpt-4',
              }),
              { promptTokens: 100, completionTokens: 50 },
            ],
          },
        ],
        expectedUsage: { input_tokens: 100, output_tokens: 50 },
      },
      {
        name: 'should handle structured tokens with cache',
        collectedUsage: [
          {
            input_tokens: 100,
            output_tokens: 50,
            input_token_details: { cache_creation: 20, cache_read: 10 },
          },
        ],
        expectedCalls: [
          {
            method: 'spendStructuredTokens',
            args: [
              expect.any(Object),
              {
                promptTokens: { input: 100, write: 20, read: 10 },
                completionTokens: 50,
              },
            ],
          },
        ],
        expectedUsage: { input_tokens: 130, output_tokens: 50 },
      },
    ];

    usageTestCases.forEach(({ name, collectedUsage, expectedCalls, expectedUsage }) => {
      it(`${name}`, async () => {
        await agentClient.recordCollectedUsage({ collectedUsage });

        expectedCalls.forEach(({ method, args }) => {
          const mockFn = method === 'spendTokens' ? spendTokens : spendStructuredTokens;
          expect(mockFn).toHaveBeenCalledWith(...args);
        });

        expect(agentClient.usage).toEqual(expectedUsage);
      });
    });

    it('should accumulate tokens across multiple usage entries', async () => {
      const collectedUsage = [
        { input_tokens: 100, output_tokens: 50 },
        { input_tokens: 180, output_tokens: 30 },
        { input_tokens: 240, output_tokens: 40 },
      ];

      await agentClient.recordCollectedUsage({ collectedUsage });

      expect(spendTokens).toHaveBeenCalledTimes(3);
      expect(agentClient.usage).toEqual({ input_tokens: 100, output_tokens: 210 });
    });

    it('should handle token spending errors', async () => {
      spendTokens.mockRejectedValueOnce(new Error('Token spending failed'));
      const collectedUsage = [{ input_tokens: 100, output_tokens: 50 }];

      await agentClient.recordCollectedUsage({ collectedUsage });

      expect(require('~/config').logger.error).toHaveBeenCalled();
    });
  });

  describe('getStreamUsage', () => {
    it('should return usage object', () => {
      agentClient.usage = { input_tokens: 100, output_tokens: 50 };
      expect(agentClient.getStreamUsage()).toEqual({ input_tokens: 100, output_tokens: 50 });
    });
  });

  describe('getTokenCountForResponse', () => {
    it('should calculate token count for response content', () => {
      agentClient.getTokenCountForMessage = jest.fn().mockReturnValue(42);
      const content = 'Response content';

      const result = agentClient.getTokenCountForResponse({ content });

      expect(agentClient.getTokenCountForMessage).toHaveBeenCalledWith({
        role: 'assistant',
        content,
      });
      expect(result).toBe(42);
    });
  });

  describe('calculateCurrentTokenCount', () => {
    const tokenCountTestCases = [
      {
        name: 'should calculate correct token count from usage',
        input: {
          tokenCountMap: { msg1: 50, msg2: 30, current: 0 },
          currentMessageId: 'current',
          usage: { input_tokens: 100 },
        },
        expected: 20,
      },
      {
        name: 'should return original estimate if calculation is negative',
        input: {
          tokenCountMap: { msg1: 100, current: 25 },
          currentMessageId: 'current',
          usage: { input_tokens: 50 },
        },
        expected: 25,
      },
      {
        name: 'should handle missing usage data',
        input: {
          tokenCountMap: { current: 42 },
          currentMessageId: 'current',
          usage: null,
        },
        expected: 42,
      },
      {
        name: 'should handle NaN token counts',
        input: {
          tokenCountMap: { msg1: 'invalid', msg2: 50, current: 0 },
          currentMessageId: 'current',
          usage: { input_tokens: 100 },
        },
        expected: 50,
      },
    ];

    tokenCountTestCases.forEach(({ name, input, expected }) => {
      it(`${name}`, () => {
        const result = agentClient.calculateCurrentTokenCount(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('chatCompletion', () => {
    let mockRun;
    let mockAbortController;

    beforeEach(() => {
      mockAbortController = new AbortController();
      mockRun = createMockRun();
      createRun.mockResolvedValue(mockRun);
      agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();
    });

    it('should complete a basic chat interaction', async () => {
      const payload = [{ role: 'user', content: 'Hello' }];

      await agentClient.chatCompletion({ payload, abortController: mockAbortController });

      expect(createRun).toHaveBeenCalledWith({
        agent: mockAgent,
        req: mockReq,
        runId: agentClient.responseMessageId,
        signal: mockAbortController.signal,
        customHandlers: mockOptions.eventHandlers,
      });
      expect(formatAgentMessages).toHaveBeenCalled();
      expect(mockRun.processStream).toHaveBeenCalled();
      expect(agentClient.recordCollectedUsage).toHaveBeenCalled();
    });

    const endpointTestCases = [
      {
        name: 'should handle agent with no system messages',
        setup: () => {
          mockAgent.model_parameters.model = 'o1-preview';
        },
        payload: [{ role: 'user', content: 'Hello' }],
        verify: () => {
          expect(mockAgent.instructions).toBeUndefined();
          expect(mockAgent.additional_instructions).toBeUndefined();
        },
      },
      {
        name: 'should handle legacy content endpoints',
        setup: () => {
          mockAgent.endpoint = 'groq';
        },
        payload: [{ role: 'user', content: { text: 'Hello' } }],
        verify: () => {
          expect(require('@librechat/agents').formatContentStrings).toHaveBeenCalled();
        },
      },
    ];

    endpointTestCases.forEach(({ name, setup, payload, verify }) => {
      it(`${name}`, async () => {
        setup();
        await agentClient.chatCompletion({ payload });
        verify();
        expect(true).toBe(true);
      });
    });

    it('should add cache control for Anthropic', async () => {
      mockAgent.model_parameters.clientOptions = {
        defaultHeaders: { 'anthropic-beta': 'prompt-caching' },
      };
      const payload = [{ role: 'user', content: 'Hello' }];

      await agentClient.chatCompletion({ payload });

      expect(addCacheControl).toHaveBeenCalled();
    });

    it('should handle sequential agents with various configurations', async () => {
      const secondAgent = createMockAgent({ id: 'agent456', name: 'Second Agent' });
      agentClient.agentConfigs.set('agent456', secondAgent);
      mockRun.Graph.contentData = [{ type: 'test' }];

      await agentClient.chatCompletion({ payload: [{ role: 'user', content: 'Hello' }] });

      expect(createRun).toHaveBeenCalledTimes(2);
      expect(sendEvent).toHaveBeenCalled();

      jest.clearAllMocks();
      mockAgent.hide_sequential_outputs = true;
      secondAgent.hide_sequential_outputs = true;
      agentClient.contentParts = [{ type: ContentTypes.TOOL_CALL }, { type: 'text' }];
      createRun.mockResolvedValue(mockRun);

      await agentClient.chatCompletion({ payload: [{ role: 'user', content: 'Hello' }] });

      expect(mockRes.write).toHaveBeenCalled();
    });

    it('should handle errors during chat completion', async () => {
      createRun.mockRejectedValueOnce(new Error('Run creation failed'));

      await agentClient.chatCompletion({ payload: [] });

      expect(require('~/config').logger.error).toHaveBeenCalled();
      expect(agentClient.contentParts).toContainEqual({
        type: 'error',
        error: 'An error occurred while processing the request: Run creation failed',
      });
    });

    it('should handle tool context maps', async () => {
      mockAgent.toolContextMap = {
        tool1: 'Tool 1 context',
        tool2: 'Tool 2 context',
      };

      await agentClient.chatCompletion({ payload: [] });

      expect(mockAgent.instructions).toContain('Tool 1 context');
      expect(mockAgent.instructions).toContain('Tool 2 context');
    });
  });

  describe('titleConvo', () => {
    let mockRun;

    beforeEach(() => {
      mockRun = {
        generateTitle: jest.fn().mockResolvedValue({ title: 'Generated Title' }),
      };
      agentClient.run = mockRun;
      agentClient.contentParts = [{ type: 'text', text: 'content' }];
      agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();
    });

    it('should generate title successfully', async () => {
      expect(agentClient.recordCollectedUsage).toBeDefined();

      const result = await agentClient.titleConvo({
        text: 'Generate a title',
        abortController: new AbortController(),
      });

      expect(result).toBe('Generated Title');
      expect(mockRun.generateTitle).toHaveBeenCalledWith({
        inputText: 'Generate a title',
        contentParts: agentClient.contentParts,
        clientOptions: expect.objectContaining({
          maxTokens: 75,
        }),
        chainOptions: expect.any(Object),
      });
    });

    const titleConvoConfigTests = [
      {
        name: 'should inherit agent model parameters',
        setup: () => {
          mockAgent.model_parameters = {
            clientOptions: { timeout: 5000 },
            apiKey: 'test-key',
            anthropicApiUrl: 'https://api.anthropic.com',
          };
          agentClient = new AgentClient({ ...mockOptions, agent: mockAgent });
          agentClient.run = mockRun;
          agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();
        },
        verify: () => {
          const call = mockRun.generateTitle.mock.calls[0][0];
          expect(call.clientOptions.clientOptions).toEqual({ timeout: 5000 });
          expect(call.clientOptions.apiKey).toBe('test-key');
          expect(call.clientOptions.anthropicApiUrl).toBe('https://api.anthropic.com');
        },
      },
      {
        name: 'should handle Azure OpenAI endpoint',
        setup: () => {
          mockAgent.endpoint = 'azureOpenAI';
          mockReq.app.locals.azureOpenAI = { titleModel: 'azure-model' };
          const initOpenAI = require('~/server/services/Endpoints/openAI/initialize');
          initOpenAI.mockResolvedValueOnce({
            llmConfig: { model: 'azure-configured' },
          });
        },
        verify: () => {
          const initOpenAI = require('~/server/services/Endpoints/openAI/initialize');
          expect(initOpenAI).toHaveBeenCalled();
        },
      },
      {
        name: 'should remove maxTokens for o1 models',
        setup: () => {
          getCustomEndpointConfig.mockResolvedValueOnce({
            titleModel: 'o1-preview',
          });
        },
        verify: () => {
          const clientOptions = mockRun.generateTitle.mock.calls[0][0].clientOptions;
          expect(clientOptions.maxTokens).toBeUndefined();
        },
      },
    ];

    titleConvoConfigTests.forEach(({ name, setup, verify }) => {
      it(`${name}`, async () => {
        setup();
        await agentClient.titleConvo({ text: 'test', abortController: new AbortController() });
        verify();
        expect(true).toBe(true);
      });
    });

    it('should record usage from metadata', async () => {
      const mockAggregator = {
        handleLLMEnd: jest.fn(),
        collected: [
          { usage: { input_tokens: 10, output_tokens: 5 } },
          { tokenUsage: { promptTokens: 20, completionTokens: 10 } },
        ],
      };
      createMetadataAggregator.mockReturnValueOnce(mockAggregator);

      await agentClient.titleConvo({ text: 'test', abortController: new AbortController() });

      expect(agentClient.recordCollectedUsage).toHaveBeenCalledWith({
        model: undefined,
        context: 'title',
        collectedUsage: [
          { input_tokens: 10, output_tokens: 5 },
          { input_tokens: 20, output_tokens: 10 },
        ],
      });
    });

    it('should throw error if run not initialized', async () => {
      agentClient.run = null;

      await expect(agentClient.titleConvo({ text: 'test' })).rejects.toThrow('Run not initialized');
    });

    it('should handle title generation errors', async () => {
      mockRun.generateTitle.mockRejectedValueOnce(new Error('Title generation failed'));

      const result = await agentClient.titleConvo({ text: 'test' });

      expect(result).toBeUndefined();
      expect(require('~/config').logger.error).toHaveBeenCalled();
    });
  });

  describe('getEncoding', () => {
    it('should return o200k_base encoding', () => {
      expect(agentClient.getEncoding()).toBe('o200k_base');
    });
  });

  describe('getTokenCount', () => {
    it('should calculate token count using Tokenizer', () => {
      const text = 'Hello world';
      agentClient.getTokenCount(text);

      expect(Tokenizer.getTokenCount).toHaveBeenCalledWith(text, 'o200k_base');
    });
  });

  describe('edge cases', () => {
    describe('configuration edge cases', () => {
      it('should handle missing agent tools gracefully', async () => {
        mockAgent.tools = null;
        agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();
        await agentClient.chatCompletion({ payload: [] });
        expect(createRun).toHaveBeenCalled();
      });

      it('should handle missing model in agent parameters', () => {
        delete mockAgent.model_parameters.model;
        const client = new AgentClient(mockOptions);
        expect(client.model).toBeUndefined();
      });

      it('should handle missing app locals and use default recursion limit', async () => {
        mockReq.app.locals = {};
        delete mockAgent.recursion_limit;
        const mockRun = createMockRun();
        createRun.mockResolvedValue(mockRun);
        agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();

        await agentClient.chatCompletion({ payload: [] });

        expect(createRun).toHaveBeenCalled();
        const processStreamCall = mockRun.processStream.mock.calls[0];
        expect(processStreamCall[1].recursionLimit).toBe(25);
      });
    });

    it('should handle complex message content in no-system-message models', async () => {
      mockAgent.model_parameters.model = 'o1-mini';
      const complexContent = [{ text: 'Hello' }, { image: 'data:image/png' }];
      const payload = [{ role: 'user', content: complexContent }];

      require('@langchain/core/messages').HumanMessage.mockImplementationOnce(function (content) {
        this.content = content;
        this.pop = jest.fn().mockReturnValue({ content: complexContent });
        this._getType = () => 'human';
      });

      agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();
      await agentClient.chatCompletion({ payload });
      expect(mockAgent.instructions).toBeUndefined();
    });

    it('should handle window message filtering for agents without tools', async () => {
      const secondAgent = createMockAgent({ id: 'agent456', tools: [] });
      agentClient.agentConfigs.set('agent456', secondAgent);

      const toolMessage = { _getType: () => 'tool' };
      const humanMessage = { _getType: () => 'human' };
      BaseClient.getMessagesForConversation.mockReturnValueOnce([toolMessage, humanMessage]);

      createRun.mockClear();
      const mockRun1 = createMockRun({
        runMessages: [{ _getType: () => 'human', content: 'response' }],
      });
      const mockRun2 = createMockRun();
      createRun.mockResolvedValueOnce(mockRun1).mockResolvedValueOnce(mockRun2);

      agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();

      const payload = [{ role: 'user', content: 'Hello' }];
      await agentClient.chatCompletion({ payload });

      // The second agent has no tools, so tool messages are filtered out
      // However, we still expect 2 runs since we have 2 agents configured
      expect(createRun).toHaveBeenCalledTimes(2);
    });

    it('should handle capability check failures', async () => {
      checkCapability.mockResolvedValueOnce(false);
      agentClient.agentConfigs.set('agent456', createMockAgent({ id: 'agent456' }));

      agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();
      await agentClient.chatCompletion({ payload: [] });

      expect(createRun).toHaveBeenCalledTimes(1);
    });

    describe('message and file handling edge cases', () => {
      it('should respect configurable thread and user IDs', async () => {
        const mockRun = createMockRun();
        createRun.mockResolvedValue(mockRun);

        agentClient.conversationId = 'thread123';
        agentClient.user = 'customUser';
        agentClient.recordCollectedUsage = jest.fn().mockResolvedValue();

        await agentClient.chatCompletion({ payload: [] });

        const config = mockRun.processStream.mock.calls[0][1];
        expect(config.configurable.thread_id).toBe('thread123');
        expect(config.configurable.user_id).toBe('customUser');
      });

      it('should handle message file map for embedded files', async () => {
        agentClient.options.endpoint = 'openAI';
        agentClient.message_file_map = {
          msg1: [
            { embedded: true, name: 'file1' },
            { metadata: { fileIdentifier: 'id123' } },
            { width: 100, height: 100 },
          ],
        };
        agentClient.getTokenCountForMessage = jest.fn(() => 10);
        agentClient.handleContextStrategy = jest.fn().mockResolvedValue({
          payload: [],
          promptTokens: 0,
          tokenCountMap: {},
          messages: [{ messageId: 'msg1', role: 'user', text: 'Hello' }],
        });

        const messages = [{ messageId: 'msg1', role: 'user', text: 'Hello' }];
        await agentClient.buildMessages(messages, 'parent123', {});

        expect(agentClient.contextHandlers.processFile).toHaveBeenCalledWith({
          embedded: true,
          name: 'file1',
        });
      });
    });
  });
});

function createMockRun({
  processStream = jest.fn().mockResolvedValue(),
  runMessages = [],
  contentData = [],
} = {}) {
  return {
    processStream,
    generateTitle: jest.fn().mockResolvedValue({ title: 'Generated Title' }),
    Graph: {
      getRunMessages: jest.fn().mockReturnValue(runMessages),
      contentData,
    },
  };
}

function createMockAgent(overrides = {}) {
  return {
    id: 'agent123',
    name: 'Test Agent',
    provider: 'openAI',
    endpoint: 'openAI',
    model_parameters: {
      model: 'gpt-4',
      temperature: 0.7,
      max_tokens: 1000,
    },
    tools: [{ name: 'tool1' }, { name: 'tool2' }],
    instructions: 'Agent instructions',
    additional_instructions: 'Additional instructions',
    hide_sequential_outputs: false,
    recursion_limit: 25,
    ...overrides,
  };
}
