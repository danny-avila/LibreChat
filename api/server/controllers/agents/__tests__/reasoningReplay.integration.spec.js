const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { ChatGenerationChunk } = require('@langchain/core/outputs');
const { AIMessageChunk, HumanMessage } = require('@langchain/core/messages');
const { createModels, createMethods } = require('@librechat/data-schemas');
const {
  Run,
  Providers,
  GraphEvents,
  FakeChatModel,
  createContentAggregator,
  formatAgentMessages,
} = require('@librechat/agents');

const USER_ID = new mongoose.Types.ObjectId().toString();
const TOKEN_COUNT = 777;

const fixtures = {
  anthropic: {
    provider: Providers.ANTHROPIC,
    model: 'claude-sonnet-5',
    secret: 'anthropic-signed-thinking',
    chunks: [
      new AIMessageChunk({
        content: [
          {
            type: 'thinking',
            thinking: 'Anthropic summary.',
            signature: 'anthropic-signed-thinking',
          },
        ],
      }),
      new AIMessageChunk({ content: 'Anthropic answer.' }),
    ],
  },
  bedrock: {
    provider: Providers.BEDROCK,
    model: 'global.anthropic.claude-sonnet-5-v1:0',
    secret: 'bedrock-signed-thinking',
    chunks: [
      new AIMessageChunk({
        content: [
          {
            type: 'reasoning_content',
            reasoningText: {
              text: 'Bedrock summary.',
              signature: 'bedrock-signed-thinking',
            },
          },
        ],
      }),
      new AIMessageChunk({ content: 'Bedrock answer.' }),
    ],
  },
  openai: {
    provider: Providers.OPENAI,
    model: 'gpt-5.6-terra',
    useResponsesApi: true,
    secret: 'openai-encrypted-reasoning',
    chunks: [
      new AIMessageChunk({
        content: '',
        additional_kwargs: {
          reasoning: { summary: [{ text: 'OpenAI summary.' }] },
        },
      }),
      new AIMessageChunk({
        content: '',
        additional_kwargs: {
          openai_responses_reasoning_replay: [
            {
              type: 'reasoning',
              id: 'rs_openai',
              status: 'completed',
              summary: [{ type: 'summary_text', text: 'OpenAI summary.' }],
              encrypted_content: 'openai-encrypted-reasoning',
            },
          ],
        },
      }),
      new AIMessageChunk({ content: 'OpenAI answer.' }),
    ],
  },
  azure: {
    provider: Providers.AZURE,
    model: 'gpt-5.6-terra',
    useResponsesApi: true,
    secret: 'azure-encrypted-reasoning',
    chunks: [
      new AIMessageChunk({
        content: '',
        additional_kwargs: {
          reasoning: { summary: [{ text: 'Azure summary.' }] },
        },
      }),
      new AIMessageChunk({
        content: '',
        additional_kwargs: {
          openai_responses_reasoning_replay: [
            {
              type: 'reasoning',
              id: 'rs_azure',
              status: 'completed',
              summary: [{ type: 'summary_text', text: 'Azure summary.' }],
              encrypted_content: 'azure-encrypted-reasoning',
            },
          ],
        },
      }),
      new AIMessageChunk({ content: 'Azure answer.' }),
    ],
  },
};

const withinProviderSwitches = [
  {
    name: 'anthropic',
    kind: 'model',
    target: { provider: Providers.ANTHROPIC, model: 'claude-opus-5' },
  },
  {
    name: 'bedrock',
    kind: 'model',
    target: {
      provider: Providers.BEDROCK,
      model: 'global.anthropic.claude-opus-5-v1:0',
    },
  },
  {
    name: 'openai',
    kind: 'model',
    target: { provider: Providers.OPENAI, model: 'gpt-5.5', useResponsesApi: true },
  },
  {
    name: 'azure',
    kind: 'model',
    target: { provider: Providers.AZURE, model: 'gpt-5.5', useResponsesApi: true },
  },
  {
    name: 'openai',
    kind: 'Responses-to-Chat API',
    target: { provider: Providers.OPENAI, model: 'gpt-5.6-terra', useResponsesApi: false },
  },
  {
    name: 'azure',
    kind: 'Responses-to-Chat API',
    target: { provider: Providers.AZURE, model: 'gpt-5.6-terra', useResponsesApi: false },
  },
];

const crossProviderSwitches = Object.entries(fixtures).flatMap(([name, fixture]) =>
  Object.entries(fixtures)
    .filter(([, target]) => target.provider !== fixture.provider)
    .map(([targetName, target]) => ({
      name,
      kind: `provider (${name} to ${targetName})`,
      target,
    })),
);

class ProviderResponseModel extends FakeChatModel {
  constructor(chunks) {
    super({ responses: [''] });
    this.chunks = chunks;
  }

  async *_streamResponseChunks(_messages, _options, runManager) {
    for (const chunk of this.chunks) {
      const text = typeof chunk.content === 'string' ? chunk.content : '';
      yield new ChatGenerationChunk({ text, message: chunk });
      void runManager?.handleLLMNewToken(text);
    }
  }
}

function createAggregationHandlers(aggregateContent) {
  return Object.fromEntries(
    [GraphEvents.ON_RUN_STEP, GraphEvents.ON_MESSAGE_DELTA, GraphEvents.ON_REASONING_DELTA].map(
      (event) => [
        event,
        {
          handle: (receivedEvent, data) => aggregateContent({ event: receivedEvent, data }),
        },
      ],
    ),
  );
}

function containsSecret(value, secret) {
  return JSON.stringify(value).includes(secret);
}

describe('reasoning replay across the MongoDB boundary', () => {
  jest.setTimeout(60000);

  let mongoServer;
  let methods;
  let modelNames;
  let mixedConversationId;
  const persisted = {};

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    const models = createModels(mongoose);
    modelNames = Object.keys(models);
    Object.assign(mongoose.models, models);
    methods = createMethods(mongoose);

    for (const [name, fixture] of Object.entries(fixtures)) {
      persisted[name] = await capturePersistAndReload(name, fixture);
    }
    mixedConversationId = await persistMixedProviderConversation();
  });

  afterAll(async () => {
    for (const collection of Object.values(mongoose.connection.collections)) {
      await collection.deleteMany({});
    }
    for (const modelName of modelNames ?? []) {
      delete mongoose.models[modelName];
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoServer?.stop();
  });

  async function capturePersistAndReload(name, fixture) {
    const { contentParts, aggregateContent } = createContentAggregator();
    const run = await Run.create({
      runId: `reasoning-replay-${name}`,
      graphConfig: {
        type: 'standard',
        llmConfig: {
          provider: fixture.provider,
          model: fixture.model,
          streamUsage: false,
          ...(fixture.useResponsesApi != null && {
            useResponsesApi: fixture.useResponsesApi,
          }),
        },
      },
      returnContent: true,
      skipCleanup: true,
      customHandlers: createAggregationHandlers(aggregateContent),
    });

    run.Graph.overrideModel = new ProviderResponseModel(fixture.chunks);
    await run.processStream(
      { messages: [new HumanMessage(`mock ${name} request`)] },
      {
        configurable: { thread_id: `reasoning-replay-${name}` },
        streamMode: 'values',
        version: 'v2',
      },
    );

    expect(containsSecret(contentParts, fixture.secret)).toBe(true);

    const conversationId = uuidv4();
    const messageId = uuidv4();
    await methods.saveMessage(
      { userId: USER_ID },
      {
        messageId,
        conversationId,
        parentMessageId: uuidv4(),
        isCreatedByUser: false,
        sender: 'Agent',
        endpoint: 'agents',
        model: 'mock-agent',
        text: '',
        content: contentParts,
        tokenCount: TOKEN_COUNT,
      },
    );

    const messages = await methods.getMessages({ user: USER_ID, conversationId });
    expect(messages).toHaveLength(1);
    expect(containsSecret(messages[0].content, fixture.secret)).toBe(true);
    return { conversationId, messageId, content: messages[0].content };
  }

  async function reloadPayload(name) {
    const { conversationId } = persisted[name];
    const messages = await methods.getMessages({ user: USER_ID, conversationId });
    return messages.map((message) => ({
      role: message.isCreatedByUser ? 'user' : 'assistant',
      messageId: message.messageId,
      text: message.text,
      content: message.content,
    }));
  }

  async function persistMixedProviderConversation() {
    const conversationId = uuidv4();
    let parentMessageId = uuidv4();
    for (const [index, [name, fixture]] of Object.entries(fixtures).entries()) {
      const messageId = uuidv4();
      await methods.saveMessage(
        { userId: USER_ID },
        {
          messageId,
          conversationId,
          parentMessageId,
          isCreatedByUser: false,
          sender: 'Agent',
          endpoint: fixture.provider,
          model: fixture.model,
          text: '',
          content: persisted[name].content,
          tokenCount: TOKEN_COUNT,
          createdAt: new Date(Date.now() + index * 1000),
        },
      );
      parentMessageId = messageId;
    }
    return conversationId;
  }

  function format(payload, target) {
    return formatAgentMessages(payload, { 0: TOKEN_COUNT }, undefined, undefined, target);
  }

  test.each(Object.entries(fixtures))(
    'replays %s reasoning after persistence for the same endpoint and model',
    async (name, fixture) => {
      const payload = await reloadPayload(name);
      const result = format(payload, fixture);

      expect(containsSecret(result.messages, fixture.secret)).toBe(true);
      expect(result.indexTokenCountMap).toEqual({ 0: TOKEN_COUNT });
    },
  );

  test.each([...withinProviderSwitches, ...crossProviderSwitches])(
    'strips $name replay on a $kind switch and restores it when switching back',
    async ({ name, target }) => {
      const fixture = fixtures[name];
      const switchedPayload = await reloadPayload(name);
      const switched = format(switchedPayload, target);

      expect(containsSecret(switched.messages, fixture.secret)).toBe(false);
      expect(switched.indexTokenCountMap).toEqual({});

      const restoredPayload = await reloadPayload(name);
      const restored = format(restoredPayload, fixture);
      expect(containsSecret(restored.messages, fixture.secret)).toBe(true);
      expect(restored.indexTokenCountMap).toEqual({ 0: TOKEN_COUNT });

      const storedAgain = await reloadPayload(name);
      expect(containsSecret(storedAgain, fixture.secret)).toBe(true);
    },
  );

  test('selects only compatible replay from a mixed-provider conversation reloaded from MongoDB', async () => {
    const mixedMessages = await methods.getMessages({
      user: USER_ID,
      conversationId: mixedConversationId,
    });
    expect(mixedMessages).toHaveLength(Object.keys(fixtures).length);
    const payload = mixedMessages.map((message) => ({
      role: 'assistant',
      messageId: message.messageId,
      text: message.text,
      content: message.content,
    }));
    const tokenMap = {};
    for (const index of payload.keys()) {
      tokenMap[index] = TOKEN_COUNT;
    }

    for (const [activeName, activeFixture] of Object.entries(fixtures)) {
      const result = formatAgentMessages(payload, tokenMap, undefined, undefined, activeFixture);
      for (const [name, fixture] of Object.entries(fixtures)) {
        expect(containsSecret(result.messages, fixture.secret)).toBe(name === activeName);
      }
      expect(Object.values(result.indexTokenCountMap)).toEqual([TOKEN_COUNT]);
    }
  });
});
