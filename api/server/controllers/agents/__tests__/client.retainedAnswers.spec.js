const mockCreateRun = jest.fn();
const mockCountFormattedMessageTokens = jest.fn(
  (message) => JSON.stringify(message?.content ?? '').length,
);
const mockFormatAgentMessages = jest.fn(() => ({
  messages: [],
  indexTokenCountMap: {},
  summary: undefined,
  boundaryTokenAdjustment: undefined,
}));
const mockFormatInstructions = jest.fn().mockResolvedValue('');

jest.mock('@librechat/agents', () => ({
  ...jest.requireActual('@librechat/agents'),
  createMetadataAggregator: () => ({ handleLLMEnd: jest.fn(), collected: [] }),
  formatAgentMessages: (...args) => mockFormatAgentMessages(...args),
}));

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  checkAccess: jest.fn(),
  createRun: (...args) => mockCreateRun(...args),
  countFormattedMessageTokens: (...args) => mockCountFormattedMessageTokens(...args),
  countTokens: jest.fn((text) => Math.ceil(String(text ?? '').length / 4)),
  createCachedTokenCounter: jest.fn(async () => jest.fn(() => 0)),
  getAgentCheckpointer: jest.fn(),
  hasDurableAgentInterruptCheckpoint: jest.fn().mockResolvedValue(true),
  initializeAgent: jest.fn(),
  isHITLEnabled: jest.fn(() => false),
  loadAgent: jest.fn(),
  maybePrewarmCodeSandbox: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({ getMCPServerTools: jest.fn() }));
jest.mock('~/server/services/MCP', () => ({
  resolveConfigServers: jest.fn().mockResolvedValue({}),
}));
jest.mock('~/models', () => ({
  bulkInsertTransactions: jest.fn(),
  getCacheMultiplier: jest.fn(),
  getAgent: jest.fn(),
  getMultiplier: jest.fn(),
  getFiles: jest.fn(),
  getMessages: jest.fn(),
  getRoleByName: jest.fn(),
  getUserMemories: jest.fn(),
  getFormattedMemories: jest.fn(),
  isAgentTriggerPrincipalActive: jest.fn().mockResolvedValue(true),
  spendStructuredTokens: jest.fn(),
  spendTokens: jest.fn(),
  updateBalance: jest.fn(),
}));
jest.mock('~/config', () => ({
  getMCPManager: jest.fn(() => ({ formatInstructionsForContext: mockFormatInstructions })),
}));

const { Constants, ContentTypes, EModelEndpoint } = require('librechat-data-provider');
const { getMessages } = require('~/models');
const AgentClient = require('../client');

const ANSWER_LINE = 'Q: Which environment should I deploy to?\nA: staging';
const LATEST_TEXT = 'what is next?';

function askPart(request, output, id) {
  return {
    type: ContentTypes.TOOL_CALL,
    tool_call: {
      id,
      name: 'ask_user_question',
      args: JSON.stringify(request),
      output,
      progress: 1,
    },
  };
}

/** The text a formatted message carries, whether its content is a string or parts. */
function contentText(message) {
  const content = message?.content;
  if (typeof content === 'string') {
    return content;
  }
  return (content ?? [])
    .filter((part) => part?.type === ContentTypes.TEXT)
    .map((part) => part.text)
    .join('\n');
}

function latestUserMessage() {
  return {
    messageId: 'u3',
    parentMessageId: 'a2',
    sender: 'User',
    text: LATEST_TEXT,
    isCreatedByUser: true,
  };
}

/**
 * A branch whose answered question sits BEFORE a checkpoint summary: the prompt
 * builder's history walk stops at the summary, so the model no longer sees the
 * message that carried the answer.
 */
function compactedBranch() {
  return [
    {
      messageId: 'u1',
      parentMessageId: Constants.NO_PARENT,
      sender: 'User',
      text: 'deploy the app',
      isCreatedByUser: true,
    },
    {
      messageId: 'a1',
      parentMessageId: 'u1',
      sender: 'Agent',
      isCreatedByUser: false,
      content: [
        { type: ContentTypes.TEXT, text: 'Let me check.' },
        askPart(
          { questions: [{ id: 'environment', question: 'Which environment should I deploy to?' }] },
          JSON.stringify({ answers: { environment: 'staging' } }),
          'tc-1',
        ),
      ],
    },
    {
      messageId: 'u2',
      parentMessageId: 'a1',
      sender: 'User',
      text: 'go on',
      isCreatedByUser: true,
    },
    {
      messageId: 'a2',
      parentMessageId: 'u2',
      sender: 'Agent',
      isCreatedByUser: false,
      content: [
        { type: ContentTypes.SUMMARY, text: 'Earlier context, compacted.', tokenCount: 5 },
        { type: ContentTypes.TEXT, text: 'Deployed.' },
      ],
    },
    latestUserMessage(),
  ];
}

function makeClient(agentsConfig = {}) {
  const client = new AgentClient({
    req: {
      user: { id: 'user-123' },
      body: { endpoint: EModelEndpoint.agents },
      config: { endpoints: { [EModelEndpoint.agents]: agentsConfig } },
    },
    res: {},
    agent: {
      id: 'agent-123',
      endpoint: EModelEndpoint.openAI,
      provider: EModelEndpoint.openAI,
      instructions: 'Base agent instructions',
      model_parameters: { model: 'gpt-4' },
      tools: [],
    },
    endpoint: EModelEndpoint.agents,
  });
  client.conversationId = 'convo-123';
  client.responseMessageId = 'response-123';
  client.shouldSummarize = true;
  client.maxContextTokens = 4096;
  return client;
}

describe('AgentClient retained answers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatInstructions.mockResolvedValue('');
    getMessages.mockResolvedValue([]);
  });

  it('quotes an answer the summary boundary removed from the prompt inside the current user turn', async () => {
    const client = makeClient();
    const rows = compactedBranch();

    const { prompt, tokenCountMap } = await client.buildMessages(rows, 'u3', {});

    expect(prompt.map((message) => message.messageId)).not.toContain('a1');
    const latest = prompt[prompt.length - 1];
    const text = contentText(latest);
    expect(text).toContain(ANSWER_LINE);
    expect(text.indexOf(ANSWER_LINE)).toBeLessThan(text.indexOf(LATEST_TEXT));
    expect(text.endsWith(LATEST_TEXT)).toBe(true);
    expect(client.options.agent.additional_instructions ?? '').not.toContain(ANSWER_LINE);
    expect(rows[4].text).toBe(LATEST_TEXT);
    expect(rows[4].content).toBeUndefined();
    expect(client.indexTokenCountMap[prompt.length - 1]).toBeGreaterThan(tokenCountMap.u3);
    expect(contentText(client.memoryPayload[client.memoryPayload.length - 1])).not.toContain(
      ANSWER_LINE,
    );
  });

  it('leaves the turn alone when the operator turned retained answers off', async () => {
    const client = makeClient({ askUserQuestion: { retainedAnswers: { enabled: false } } });

    const { prompt } = await client.buildMessages(compactedBranch(), 'u3', {});

    expect(contentText(prompt[prompt.length - 1])).toBe(LATEST_TEXT);
    expect(client.memoryPayload).toBeNull();
  });

  it('reads the stored branch for a warm event-actor turn that skipped history', async () => {
    const client = makeClient();
    client.eventActorContinuation = 'warm';
    getMessages.mockResolvedValue(compactedBranch());

    const { prompt } = await client.buildMessages([latestUserMessage()], 'u3', {});

    expect(getMessages).toHaveBeenCalledWith(
      { conversationId: 'convo-123', user: 'user-123' },
      'messageId parentMessageId content',
    );
    expect(contentText(prompt[prompt.length - 1])).toContain(ANSWER_LINE);
  });

  it('does not read the stored branch for a warm turn when retention is off', async () => {
    const client = makeClient({ askUserQuestion: { retainedAnswers: { enabled: false } } });
    client.eventActorContinuation = 'warm';

    await client.buildMessages([latestUserMessage()], 'u3', {});

    expect(getMessages).not.toHaveBeenCalled();
  });
});
