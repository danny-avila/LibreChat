jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({ content: 'mocked response' }),
  })),
}));

jest.mock('~/utils/tokenizer', () => ({
  __esModule: true,
  default: { getTokenCount: jest.fn(() => 42) },
}));

jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');

  function mockMakeChain(): Record<string, jest.Mock> {
    const c: Record<string, jest.Mock> = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      distinct: jest.fn(),
      sort: jest.fn(),
      select: jest.fn(),
      skip: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
    };
    c.find.mockReturnValue(c);
    c.findOne.mockReturnValue(c);
    c.findById.mockReturnValue(c);
    c.sort.mockReturnValue(c);
    c.select.mockReturnValue(c);
    c.skip.mockReturnValue(c);
    c.limit.mockReturnValue(c);
    c.lean.mockResolvedValue(null);
    return c;
  }

  const mockModels = {
    Conversation: mockMakeChain(),
    MemoryDocument: mockMakeChain(),
    SynthesisRun: mockMakeChain(),
    UserProject: mockMakeChain(),
    Message: mockMakeChain(),
  };

  return {
    __esModule: true,
    default: {
      ...actual,
      models: mockModels,
      Types: actual.Types,
    },
    Types: actual.Types,
  };
});

import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import { ChatOpenAI } from '@langchain/openai';
import { runSynthesisForScope, runSynthesisForUser } from '../synthesize';
import { readFullConversation, readConversationExcerpt } from '../tools';
import { getSummaryPrompt, getSynthesisPrompt } from '../prompts';

interface MockChainableModel {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneAndUpdate: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  findById: jest.Mock;
  create: jest.Mock;
  distinct: jest.Mock;
  sort: jest.Mock;
  select: jest.Mock;
  skip: jest.Mock;
  limit: jest.Mock;
  lean: jest.Mock;
}

const mockLogger = logger as unknown as Record<string, jest.Mock>;

function getModel(name: string): MockChainableModel {
  const models = (mongoose as unknown as { models: Record<string, MockChainableModel> }).models;
  return models[name];
}

function resetChain(m: MockChainableModel): void {
  m.find.mockReturnValue(m);
  m.findOne.mockReturnValue(m);
  m.findById.mockReturnValue(m);
  m.sort.mockReturnValue(m);
  m.select.mockReturnValue(m);
  m.skip.mockReturnValue(m);
  m.limit.mockReturnValue(m);
  m.lean.mockResolvedValue(null);
}

const TEST_USER_ID = 'user-abc-123';
const TEST_CONVO_ID = 'convo-xyz-789';

const defaultConfig = {
  summaryModel: 'gpt-4.1-mini',
  summaryApiKey: 'sk-test-summary',
  synthesisModel: 'gpt-4.1',
  synthesisApiKey: 'sk-test-synthesis',
};

describe('Synthesis Pipeline', () => {
  let Conversation: MockChainableModel;
  let MemoryDocument: MockChainableModel;
  let SynthesisRun: MockChainableModel;
  let UserProject: MockChainableModel;
  let Message: MockChainableModel;

  beforeEach(() => {
    jest.clearAllMocks();

    Conversation = getModel('Conversation');
    MemoryDocument = getModel('MemoryDocument');
    SynthesisRun = getModel('SynthesisRun');
    UserProject = getModel('UserProject');
    Message = getModel('Message');

    resetChain(Conversation);
    resetChain(MemoryDocument);
    resetChain(SynthesisRun);
    resetChain(UserProject);
    resetChain(Message);

    Message.lean.mockResolvedValue([]);

    (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
      invoke: jest.fn().mockResolvedValue({ content: 'mocked response' }),
    }));
  });

  describe('prompts', () => {
    it('getSummaryPrompt returns a non-empty string', () => {
      const prompt = getSummaryPrompt();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('summarizer');
    });

    it('getSynthesisPrompt with global scope returns prompt without project context', () => {
      const prompt = getSynthesisPrompt('global');
      expect(prompt).toContain('universally relevant');
      expect(prompt).not.toContain('{{projectName}}');
      expect(prompt).not.toContain('MyProject');
    });

    it('getSynthesisPrompt with project scope returns prompt with project name and description', () => {
      const prompt = getSynthesisPrompt('project', 'MyProject', 'A cool project');
      expect(prompt).toContain('MyProject');
      expect(prompt).toContain('A cool project');
      expect(prompt).not.toContain('{{projectName}}');
      expect(prompt).not.toContain('{{projectDescription}}');
    });

    it('getSynthesisPrompt with project scope but no description strips the conditional block', () => {
      const prompt = getSynthesisPrompt('project', 'MyProject');
      expect(prompt).toContain('MyProject');
      expect(prompt).not.toContain('{{#if projectDescription}}');
      expect(prompt).not.toContain('{{/if}}');
    });
  });

  describe('tools', () => {
    it('readFullConversation returns formatted transcript from messages', async () => {
      Message.lean.mockResolvedValueOnce([
        { messageId: 'm1', sender: 'User', text: 'Hello', isCreatedByUser: true, createdAt: new Date() },
        { messageId: 'm2', sender: 'Assistant', text: 'Hi there!', isCreatedByUser: false, createdAt: new Date() },
      ]);

      const result = await readFullConversation(TEST_CONVO_ID, TEST_USER_ID);
      expect(result).toBe('[User]: Hello\n\n[Assistant]: Hi there!');
      expect(Message.find).toHaveBeenCalledWith({
        conversationId: TEST_CONVO_ID,
        user: TEST_USER_ID,
      });
    });

    it('readFullConversation returns "No messages found." when no messages exist', async () => {
      Message.lean.mockResolvedValueOnce([]);

      const result = await readFullConversation(TEST_CONVO_ID, TEST_USER_ID);
      expect(result).toBe('No messages found.');
    });

    it('readConversationExcerpt returns a subset of messages', async () => {
      Message.lean.mockResolvedValueOnce([
        { messageId: 'm2', sender: 'User', text: 'Second message', isCreatedByUser: true, createdAt: new Date() },
      ]);

      const result = await readConversationExcerpt(TEST_CONVO_ID, TEST_USER_ID, 1, 2);
      expect(result).toBe('[User]: Second message');
      expect(Message.skip).toHaveBeenCalledWith(1);
      expect(Message.limit).toHaveBeenCalledWith(1);
    });
  });

  describe('runSynthesisForScope', () => {
    const runId = new mongoose.Types.ObjectId();

    beforeEach(() => {
      SynthesisRun.create.mockResolvedValue({ _id: runId });
    });

    it('creates a SynthesisRun, processes conversations, and updates the memory document', async () => {
      const mockInvoke = jest.fn()
        .mockResolvedValueOnce({ content: 'User prefers TypeScript.' })
        .mockResolvedValueOnce({ content: '## Preferences\n- TypeScript' });

      (ChatOpenAI as unknown as jest.Mock).mockImplementation(() => ({
        invoke: mockInvoke,
      }));

      Conversation.lean
        .mockResolvedValueOnce([
          { conversationId: TEST_CONVO_ID, title: 'Test Conversation' },
        ])
        .mockResolvedValueOnce({
          conversationId: TEST_CONVO_ID,
          title: 'Test Conversation',
        });

      Message.lean.mockResolvedValueOnce([
        { messageId: 'm1', sender: 'User', text: 'Remember I like TypeScript', isCreatedByUser: true, createdAt: new Date() },
      ]);

      await runSynthesisForScope(TEST_USER_ID, 'global', defaultConfig);

      expect(SynthesisRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER_ID,
          scope: 'global',
          status: 'running',
        }),
      );

      expect(MemoryDocument.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, scope: 'global' }),
        expect.objectContaining({ content: '## Preferences\n- TypeScript' }),
        { upsert: true, new: true },
      );

      expect(SynthesisRun.findByIdAndUpdate).toHaveBeenLastCalledWith(
        runId,
        expect.objectContaining({ status: 'completed' }),
      );
    });

    it('completes with 0 conversations processed when none found', async () => {
      Conversation.lean.mockResolvedValueOnce([]);

      await runSynthesisForScope(TEST_USER_ID, 'global', defaultConfig);

      expect(SynthesisRun.create).toHaveBeenCalled();
      expect(SynthesisRun.findByIdAndUpdate).toHaveBeenCalledWith(
        runId,
        expect.objectContaining({
          status: 'completed',
          conversationsProcessed: 0,
        }),
      );
    });

    it('marks run as failed on error', async () => {
      Conversation.lean.mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(
        runSynthesisForScope(TEST_USER_ID, 'global', defaultConfig),
      ).rejects.toThrow('DB connection lost');

      expect(SynthesisRun.findByIdAndUpdate).toHaveBeenCalledWith(
        runId,
        expect.objectContaining({
          status: 'failed',
          error: 'DB connection lost',
        }),
      );
    });
  });

  describe('runSynthesisForUser', () => {
    const runId = new mongoose.Types.ObjectId();
    const projectId = new mongoose.Types.ObjectId();

    beforeEach(() => {
      SynthesisRun.create.mockResolvedValue({ _id: runId });
      Conversation.lean.mockResolvedValue([]);
    });

    it('runs global scope then per-project scopes', async () => {
      UserProject.lean.mockResolvedValueOnce([
        { _id: projectId, name: 'Project A', description: 'Desc A' },
      ]);

      await runSynthesisForUser(TEST_USER_ID, defaultConfig);

      expect(SynthesisRun.create).toHaveBeenCalledTimes(2);
      expect(SynthesisRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'global' }),
      );
      expect(SynthesisRun.create).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'project', projectId: projectId.toString() }),
      );
    });

    it('continues processing other projects when one project fails', async () => {
      const projectId2 = new mongoose.Types.ObjectId();

      UserProject.lean.mockResolvedValueOnce([
        { _id: projectId, name: 'Project A' },
        { _id: projectId2, name: 'Project B' },
      ]);

      Conversation.lean
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Project A synthesis failed'))
        .mockResolvedValueOnce([]);

      await runSynthesisForUser(TEST_USER_ID, defaultConfig);

      expect(SynthesisRun.create).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in project synthesis'),
        expect.anything(),
      );
    });
  });
});
