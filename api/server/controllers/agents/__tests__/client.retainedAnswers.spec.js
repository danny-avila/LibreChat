const mockCreateRun = jest.fn();
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
  countFormattedMessageTokens: jest.fn(() => 42),
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
const { GenerationJobManager } = require('@librechat/api');
const AgentClient = require('../client');

const ANSWER_LINE = 'Q: Which environment should I deploy to?\nA: staging';

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
    {
      messageId: 'u3',
      parentMessageId: 'a2',
      sender: 'User',
      text: 'what is next?',
      isCreatedByUser: true,
    },
  ];
}

function makeAgent() {
  return {
    id: 'agent-123',
    endpoint: EModelEndpoint.openAI,
    provider: EModelEndpoint.openAI,
    instructions: 'Base agent instructions',
    model_parameters: { model: 'gpt-4' },
    tools: [],
  };
}

describe('AgentClient retained answers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatInstructions.mockResolvedValue('');
  });

  describe('buildMessages', () => {
    function makeClient(agentsConfig = {}) {
      const client = new AgentClient({
        req: {
          user: { id: 'user-123' },
          body: { endpoint: EModelEndpoint.agents },
          config: { endpoints: { [EModelEndpoint.agents]: agentsConfig } },
        },
        res: {},
        agent: makeAgent(),
        endpoint: EModelEndpoint.agents,
      });
      client.conversationId = 'convo-123';
      client.responseMessageId = 'response-123';
      client.shouldSummarize = true;
      client.maxContextTokens = 4096;
      return client;
    }

    it('carries an answer the summary boundary removed from the prompt into the dynamic tail', async () => {
      const client = makeClient();

      const { prompt } = await client.buildMessages(compactedBranch(), 'u3', {});

      expect(prompt.map((message) => message.messageId)).not.toContain('a1');
      expect(client.options.agent.additional_instructions).toContain(ANSWER_LINE);
    });

    it('leaves the tail alone when the operator turned retained answers off', async () => {
      const client = makeClient({ askUserQuestion: { retainedAnswers: { enabled: false } } });

      await client.buildMessages(compactedBranch(), 'u3', {});

      expect(client.options.agent.additional_instructions ?? '').not.toContain(ANSWER_LINE);
    });
  });

  describe('resumeCompletion', () => {
    it('rebuilds the tail from the stored branch and the answer just given', async () => {
      const streamId = 'conversation-retained-answers-resume';
      const job = await GenerationJobManager.createJob(streamId, 'user-123', streamId);
      const client = new AgentClient({
        req: {
          user: { id: 'user-123' },
          body: { endpoint: EModelEndpoint.agents, agent_id: 'agent-123', isTemporary: true },
          config: { endpoints: { [EModelEndpoint.agents]: {} } },
          _resumableStreamId: streamId,
        },
        res: {},
        agent: makeAgent(),
        contentParts: [],
        collectedUsage: [],
        artifactPromises: [],
        jobCreatedAt: job.createdAt,
      });
      const resume = jest.fn();
      mockCreateRun.mockImplementationOnce(async () => ({
        Graph: null,
        resume,
        processStream: jest.fn().mockResolvedValue(),
        getCalibrationRatio: jest.fn(() => 0),
        getInterrupt: jest.fn(() => undefined),
      }));
      client.conversationId = streamId;
      client.responseMessageId = 'response-retained-answers';
      client.parentMessageId = 'u3';
      client.recordCollectedUsage = jest.fn().mockResolvedValue();

      await client.resumeCompletion({
        resumeValue: { answers: { window: 'last 7 days' } },
        streamId,
        checkpointNamespace: 'retained-answers',
        conversationMessages: compactedBranch(),
        seedContent: [
          { type: ContentTypes.TEXT, text: 'One more thing.' },
          askPart(
            { questions: [{ id: 'window', question: 'Which time window?' }] },
            JSON.stringify({ answers: { window: 'last 7 days' } }),
            'tc-2',
          ),
        ],
      });

      expect(resume).toHaveBeenCalledTimes(1);
      const tail = client.options.agent.additional_instructions;
      expect(tail).toContain(ANSWER_LINE);
      expect(tail).toContain('Q: Which time window?\nA: last 7 days');
      expect(tail.indexOf(ANSWER_LINE)).toBeLessThan(tail.indexOf('Which time window?'));
    });
  });
});
