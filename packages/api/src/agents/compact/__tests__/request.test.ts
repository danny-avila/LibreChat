import { Constants, ContentTypes } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { TMessage } from 'librechat-data-provider';
import type { CompactRequestDeps } from '../request';
import type { ServerRequest } from '~/types';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

/** No Redis in unit tests, so the lock degrades to its documented no-op lease. */
const mockCompactConversation = jest.fn();
jest.mock('../summary', () => {
  const actual = jest.requireActual('../summary');
  return {
    ...actual,
    compactConversation: (...args: unknown[]) => mockCompactConversation(...args),
  };
});

const mockCheckAndIncrement = jest.fn();
const mockDecrement = jest.fn();
jest.mock('~/middleware/concurrency', () => {
  const actual = jest.requireActual('~/middleware/concurrency');
  return {
    ...actual,
    checkAndIncrementPendingRequest: (userId: string) => mockCheckAndIncrement(userId),
    decrementPendingRequest: (userId: string) => mockDecrement(userId),
  };
});

import { handleCompactRequest, CompactErrorCodes } from '../request';
import { NothingToCompactError } from '../summary';

const SUMMARY = {
  type: ContentTypes.SUMMARY,
  content: [{ type: ContentTypes.TEXT, text: '## Checkpoint' }],
  tokenCount: 120,
  model: 'gpt-4o-mini',
  provider: 'openAI',
};

function userMessage(id: string, parentMessageId: string): TMessage {
  return {
    messageId: id,
    parentMessageId,
    conversationId: 'convo_1',
    isCreatedByUser: true,
    sender: 'User',
    text: 'hello',
  } as TMessage;
}

function assistantMessage(id: string, parentMessageId: string, metadata?: object): TMessage {
  return {
    messageId: id,
    parentMessageId,
    conversationId: 'convo_1',
    isCreatedByUser: false,
    sender: 'Claude',
    text: '',
    content: [{ type: ContentTypes.TEXT, text: 'hi' }],
    ...(metadata ? { metadata } : {}),
  } as TMessage;
}

const BRANCH = [
  userMessage('m1', Constants.NO_PARENT),
  assistantMessage('m2', 'm1', { contextUsage: { effectiveInstructionTokens: 400 } }),
];

function makeReq(overrides: Record<string, unknown> = {}): ServerRequest {
  return {
    user: { id: 'user_1' },
    config: { endpoints: {}, interfaceConfig: {} } as AppConfig,
    body: {
      conversationId: 'convo_1',
      parentMessageId: 'm2',
      endpoint: 'openAI',
      endpointOption: { agent: Promise.resolve({ provider: 'openAI', model: 'gpt-4o-mini' }) },
      ...overrides,
    },
  } as unknown as ServerRequest;
}

function makeDeps(overrides: Partial<CompactRequestDeps> = {}): CompactRequestDeps {
  return {
    getUserKey: jest.fn().mockResolvedValue(''),
    getUserKeyValues: jest.fn().mockResolvedValue({}),
    getFiles: jest.fn().mockResolvedValue([]),
    getMessages: jest.fn(async (filter) =>
      filter.parentMessageId != null ? [] : (BRANCH as TMessage[]),
    ),
    saveMessage: jest.fn(async (_ctx, message) => message as TMessage),
    deleteMessages: jest.fn().mockResolvedValue(undefined),
    getModelsConfig: jest.fn().mockResolvedValue({ openAI: ['gpt-4o-mini'] }),
    getJob: jest.fn().mockResolvedValue(null),
    logViolation: jest.fn().mockResolvedValue(undefined),
    getMultiplier: jest.fn().mockReturnValue(1),
    getCacheMultiplier: jest.fn().mockReturnValue(1),
    spendTokens: jest.fn().mockResolvedValue(undefined),
    spendStructuredTokens: jest.fn().mockResolvedValue(undefined),
    insertMany: jest.fn().mockResolvedValue(undefined),
    updateBalance: jest.fn().mockResolvedValue(undefined),
    findBalanceByUser: jest.fn().mockResolvedValue(null),
    createAutoRefillTransaction: jest.fn().mockResolvedValue(undefined),
    upsertBalanceFields: jest.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as CompactRequestDeps;
}

const res = {} as Parameters<typeof handleCompactRequest>[0]['res'];

describe('handleCompactRequest', () => {
  beforeEach(() => {
    mockCompactConversation.mockReset();
    mockCompactConversation.mockResolvedValue({
      summary: SUMMARY,
      messagesCompacted: 2,
      provider: 'openAI',
      model: 'gpt-4o-mini',
      passes: [
        {
          usage: { model: 'gpt-4o-mini', provider: 'openAI', input_tokens: 900, output_tokens: 80 },
          counted: { input_tokens: 700, output_tokens: 60 },
        },
      ],
    });
    mockCheckAndIncrement.mockReset();
    mockCheckAndIncrement.mockResolvedValue({ allowed: true, pendingRequests: 1, limit: 2 });
    mockDecrement.mockReset();
    mockDecrement.mockResolvedValue(undefined);
  });

  it('persists the summary with the compacted baseline and the billed usage', async () => {
    const deps = makeDeps();
    const result = await handleCompactRequest({ req: makeReq(), res }, deps);

    expect(result.status).toBe(201);
    const saved = (deps.saveMessage as jest.Mock).mock.calls[0][1];
    expect(saved.content).toEqual([SUMMARY]);
    /** Summary tokens plus the branch's observed instruction overhead: the
     *  client stops adding its own once this marker exists. */
    expect(saved.metadata.summaryUsedTokens).toBe(520);
    expect(saved.metadata.usage).toMatchObject({ input: 900, output: 80 });
    /** Inherits the branch's assistant identity. */
    expect(saved.sender).toBe('Claude');
  });

  it('refuses an Assistants conversation instead of failing inside model resolution', async () => {
    const result = await handleCompactRequest(
      { req: makeReq({ endpoint: 'assistants' }), res },
      makeDeps(),
    );
    expect(result).toMatchObject({
      status: 400,
      code: CompactErrorCodes.UNSUPPORTED_ENDPOINT,
    });
    expect(mockCompactConversation).not.toHaveBeenCalled();
  });

  it('honors the summarization kill switch', async () => {
    const req = makeReq();
    (req.config as AppConfig).summarization = { enabled: false };
    const result = await handleCompactRequest({ req, res }, makeDeps());
    expect(result).toMatchObject({ status: 403, code: CompactErrorCodes.COMPACTION_DISABLED });
  });

  it('refuses to compact under a live generation', async () => {
    const deps = makeDeps({ getJob: jest.fn().mockResolvedValue({ status: 'running' }) });
    const result = await handleCompactRequest({ req: makeReq(), res }, deps);
    expect(result).toMatchObject({ status: 409, code: CompactErrorCodes.GENERATING });
    expect(mockCompactConversation).not.toHaveBeenCalled();
  });

  it('waits for a terminal generation whose message has not been saved yet', async () => {
    /** The status CAS runs before the DB write, so compacting here would load
     *  the old leaf and bill a summarizer for a branch about to change. */
    const deps = makeDeps({
      getJob: jest
        .fn()
        .mockResolvedValue({ status: 'complete', metadata: { terminalPersistencePending: true } }),
    });
    const result = await handleCompactRequest({ req: makeReq(), res }, deps);
    expect(result).toMatchObject({ status: 409, code: CompactErrorCodes.GENERATING });
    expect(mockCompactConversation).not.toHaveBeenCalled();
  });

  it('compacts with the request-resolved model parameters, not the stored ones', async () => {
    /** An enforced model spec lands in `endpointOption.model_parameters` while
     *  `endpointOption.agent` stays the raw document; normal turns run the
     *  resolved values, so compaction has to as well. LibreChat-only keys are
     *  not provider parameters and are dropped exactly as they are normally. */
    const req = makeReq({
      endpointOption: {
        agent: Promise.resolve({
          provider: 'openAI',
          model: 'gpt-4o-mini',
          model_parameters: { model: 'gpt-4o-mini', temperature: 0.2 },
        }),
        model_parameters: { model: 'gpt-4o', temperature: 0.9, maxContextTokens: 8000 },
      },
    });
    const deps = makeDeps({ getModelsConfig: jest.fn().mockResolvedValue({ openAI: ['gpt-4o'] }) });

    const result = await handleCompactRequest({ req, res }, deps);

    expect(result).toMatchObject({ status: 201 });
    expect(mockCompactConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: expect.objectContaining({
          model: 'gpt-4o',
          model_parameters: { model: 'gpt-4o', temperature: 0.9 },
        }),
      }),
    );
  });

  it('rejects a model the caller is not allowed to use', async () => {
    const deps = makeDeps({ getModelsConfig: jest.fn().mockResolvedValue({ openAI: ['gpt-4o'] }) });
    const result = await handleCompactRequest({ req: makeReq(), res }, deps);
    expect(result).toMatchObject({ status: 422, code: CompactErrorCodes.ILLEGAL_MODEL });
    expect(mockCompactConversation).not.toHaveBeenCalled();
    expect(deps.logViolation).toHaveBeenCalled();
  });

  it('takes and releases the per-user concurrency slot', async () => {
    await handleCompactRequest({ req: makeReq(), res }, makeDeps());
    expect(mockCheckAndIncrement).toHaveBeenCalledWith('user_1');
    expect(mockDecrement).toHaveBeenCalledWith('user_1');
  });

  it('rejects when the user is over the concurrency limit, without spending', async () => {
    mockCheckAndIncrement.mockResolvedValue({ allowed: false, pendingRequests: 3, limit: 2 });
    const result = await handleCompactRequest({ req: makeReq(), res }, makeDeps());
    expect(result).toMatchObject({ status: 429, code: CompactErrorCodes.CONCURRENT_LIMIT });
    expect(mockCompactConversation).not.toHaveBeenCalled();
    /** The slot was never taken, so it must not be released either. */
    expect(mockDecrement).not.toHaveBeenCalled();
  });

  it('rejects a leaf that already has a child without spending', async () => {
    const deps = makeDeps({
      getMessages: jest.fn(async () => [
        ...(BRANCH as TMessage[]),
        /** Another client already advanced past the requested leaf. */
        { messageId: 'm3', parentMessageId: 'm2' } as TMessage,
      ]),
    });

    const result = await handleCompactRequest({ req: makeReq(), res }, deps);
    expect(result).toMatchObject({ status: 409, code: CompactErrorCodes.BRANCH_MOVED });
    expect(mockCompactConversation).not.toHaveBeenCalled();
  });

  it('does not write when a turn claimed the tail during the model call', async () => {
    const deps = makeDeps({
      getMessages: jest.fn(async (filter) =>
        filter.parentMessageId != null
          ? [{ messageId: 'other' } as TMessage]
          : (BRANCH as TMessage[]),
      ),
    });
    const result = await handleCompactRequest({ req: makeReq(), res }, deps);
    expect(result).toMatchObject({ status: 409, code: CompactErrorCodes.BRANCH_MOVED });
    expect(deps.saveMessage).not.toHaveBeenCalled();
  });

  it('rolls the summary back when a sibling lands between the check and the insert', async () => {
    let sawInsert = false;
    const deps = makeDeps({
      getMessages: jest.fn(async (filter) => {
        if (filter.parentMessageId == null) {
          return BRANCH as TMessage[];
        }
        /** Empty before the insert, two children after: a turn raced in. */
        if (!sawInsert) {
          return [];
        }
        return [{ messageId: 'other' } as TMessage, { messageId: 'ours' } as TMessage];
      }),
      saveMessage: jest.fn(async (_ctx, message) => {
        sawInsert = true;
        return message as TMessage;
      }),
    });

    const result = await handleCompactRequest({ req: makeReq(), res }, deps);
    expect(result).toMatchObject({ status: 409, code: CompactErrorCodes.BRANCH_MOVED });
    /** The compensating delete is what makes the outcome atomic for a reader. */
    expect(deps.deleteMessages).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'convo_1', user: 'user_1' }),
    );
  });

  it('reads the job before the siblings so a settling turn cannot slip between', async () => {
    /** The terminal claim sets `terminalPersistencePending` before saving the
     *  response and clears it after, so a job that reads inactive has already
     *  written any child it was going to write. Reading the children first
     *  leaves the window where a turn saves and settles between the two. */
    const order: string[] = [];
    let sawInsert = false;
    const deps = makeDeps({
      getJob: jest.fn(async () => {
        if (sawInsert) {
          order.push('job');
        }
        return null;
      }),
      getMessages: jest.fn(async (filter) => {
        if (filter.parentMessageId == null) {
          return BRANCH as TMessage[];
        }
        if (sawInsert) {
          order.push('siblings');
        }
        return sawInsert ? [{ messageId: 'ours' } as TMessage] : [];
      }),
      saveMessage: jest.fn(async (_ctx, message) => {
        sawInsert = true;
        return message as TMessage;
      }),
    });

    const result = await handleCompactRequest({ req: makeReq(), res }, deps);

    expect(result).toMatchObject({ status: 201 });
    expect(order).toEqual(['job', 'siblings']);
  });

  it('prices the balance gate at the largest pass, not the summed estimate', async () => {
    /** Premium long-context rates are keyed off ONE call's input. Without it
     *  the gate approves at the standard rate a call that is then charged at
     *  the premium one. */
    const req = makeReq();
    (req.config as AppConfig).balance = { enabled: true } as AppConfig['balance'];
    const deps = makeDeps({
      findBalanceByUser: jest.fn().mockResolvedValue({ tokenCredits: 100_000_000 }),
    });

    await handleCompactRequest({ req, res }, deps);

    const params = mockCompactConversation.mock.calls[0][0] as {
      beforeInvoke: (estimate: {
        promptTokens: number;
        passPromptTokens: number[];
        model?: string;
        provider: string;
        endpoint: string;
        balanceEndpoint: string;
      }) => Promise<void>;
    };
    await params.beforeInvoke({
      promptTokens: 300_000,
      passPromptTokens: [100_000, 200_000],
      model: 'gpt-5.4',
      provider: 'openAI',
      endpoint: 'openAI',
      balanceEndpoint: 'openAI',
    });

    expect(deps.getMultiplier).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokenCount: 200_000, tokenType: 'prompt' }),
    );
  });

  it('rolls back when a turn started during the compaction, even once it settled', async () => {
    /** A job is created before its response is saved, so a turn that began and
     *  finished during the call is visible here rather than only through a
     *  sibling row that may not be written yet. */
    let sawInsert = false;
    const deps = makeDeps({
      getJob: jest.fn(async () =>
        sawInsert ? { status: 'complete', createdAt: Date.now() + 1000 } : null,
      ),
      saveMessage: jest.fn(async (_ctx, message) => {
        sawInsert = true;
        return message as TMessage;
      }),
    });

    const result = await handleCompactRequest({ req: makeReq(), res }, deps);

    expect(result).toMatchObject({ status: 409, code: CompactErrorCodes.BRANCH_MOVED });
    expect(deps.deleteMessages).toHaveBeenCalled();
  });

  it('ignores a job left behind by an earlier turn', async () => {
    const deps = makeDeps({
      getJob: jest.fn(async () => ({ status: 'complete', createdAt: Date.now() - 60_000 })),
    });

    const result = await handleCompactRequest({ req: makeReq(), res }, deps);

    expect(result).toMatchObject({ status: 201 });
  });

  it('prices a multi-pass gate as the sum of each pass at its own tier', async () => {
    const req = makeReq();
    (req.config as AppConfig).balance = { enabled: true } as AppConfig['balance'];
    /** 3 credits per token above 150k, 1 below: the premium pass must not drag
     *  the cheaper one up with it. */
    const getMultiplier = jest.fn(({ inputTokenCount }: { inputTokenCount?: number }) =>
      (inputTokenCount ?? 0) > 150_000 ? 3 : 1,
    );
    const deps = makeDeps({
      getMultiplier,
      findBalanceByUser: jest.fn().mockResolvedValue({ tokenCredits: 100_000_000 }),
    });

    await handleCompactRequest({ req, res }, deps);
    const params = mockCompactConversation.mock.calls[0][0] as {
      beforeInvoke: (estimate: {
        promptTokens: number;
        passPromptTokens: number[];
        model?: string;
        provider: string;
        endpoint: string;
        balanceEndpoint: string;
      }) => Promise<void>;
    };
    await params.beforeInvoke({
      promptTokens: 300_000,
      passPromptTokens: [100_000, 200_000],
      model: 'gpt-5.4',
      provider: 'openAI',
      endpoint: 'openAI',
      balanceEndpoint: 'openAI',
    });

    /** 100k at 1 plus 200k at 3, not 300k at either rate. */
    expect(getMultiplier).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokenCount: 100_000 }),
    );
    expect(getMultiplier).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokenCount: 200_000 }),
    );
  });

  it('marks a baseline that could not include instruction overhead', async () => {
    /** A branch whose responses carry no context snapshot leaves the overhead
     *  unknown here, and the client suppresses its own cached value whenever a
     *  baseline exists. */
    const snapshotless = [userMessage('m1', Constants.NO_PARENT), assistantMessage('m2', 'm1')];
    const deps = makeDeps({
      getMessages: jest.fn(async (filter) =>
        filter.parentMessageId == null ? (snapshotless as TMessage[]) : [],
      ),
    });

    const result = await handleCompactRequest({ req: makeReq(), res }, deps);

    expect(result).toMatchObject({ status: 201 });
    expect(deps.saveMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ summaryExcludesOverhead: true }),
      }),
      expect.anything(),
    );
  });

  it('omits the flag when a snapshot supplied the overhead', async () => {
    const deps = makeDeps();

    await handleCompactRequest({ req: makeReq(), res }, deps);

    const saved = (deps.saveMessage as jest.Mock).mock.calls[0][1] as Partial<TMessage>;
    expect(saved.metadata).not.toHaveProperty('summaryExcludesOverhead');
    /** 120 summary tokens plus the snapshot's 400 of instruction overhead. */
    expect(saved.metadata?.summaryUsedTokens).toBe(520);
  });

  it('bills a locally counted estimate when the provider reported no usage', async () => {
    mockCompactConversation.mockResolvedValue({
      summary: SUMMARY,
      messagesCompacted: 2,
      provider: 'openAI',
      model: 'gpt-4o-mini',
      passes: [{ counted: { input_tokens: 700, output_tokens: 60 } }],
    });

    const deps = makeDeps();
    const result = await handleCompactRequest({ req: makeReq(), res }, deps);

    expect(result.status).toBe(201);
    /** The summary was persisted, so the call must not go unrecorded. With
     *  pricing and bulk deps present, `recordCollectedUsage` writes through the
     *  batched transaction path rather than `spendTokens`. */
    expect(deps.insertMany).toHaveBeenCalled();
    const saved = (deps.saveMessage as jest.Mock).mock.calls[0][1];
    expect(saved.metadata.usage).toMatchObject({ input: 700, output: 60 });
  });

  it('rolls back when a turn claimed the conversation but has not written yet', async () => {
    let sawInsert = false;
    const deps = makeDeps({
      /** No sibling lands, but the job is running by the time we verify. */
      getJob: jest.fn(async () => (sawInsert ? { status: 'running' } : null)),
      saveMessage: jest.fn(async (_ctx, message) => {
        sawInsert = true;
        return message as TMessage;
      }),
    });

    const result = await handleCompactRequest({ req: makeReq(), res }, deps);
    expect(result).toMatchObject({ status: 409, code: CompactErrorCodes.BRANCH_MOVED });
    expect(deps.deleteMessages).toHaveBeenCalled();
  });

  it('bills the passes that completed when a later one throws', async () => {
    const { PartialCompactionError } = jest.requireActual('../summary');
    mockCompactConversation.mockRejectedValue(
      new PartialCompactionError({
        cause: new Error('provider exploded'),
        passes: [
          {
            usage: {
              model: 'gpt-4o-mini',
              provider: 'openAI',
              input_tokens: 500,
              output_tokens: 20,
            },
            counted: { input_tokens: 500, output_tokens: 20 },
          },
        ],
        model: 'gpt-4o-mini',
        provider: 'openAI',
      }),
    );

    const deps = makeDeps();
    const result = await handleCompactRequest({ req: makeReq(), res }, deps);

    expect(result.status).toBe(500);
    /** The completed provider call is still charged. */
    expect(deps.insertMany).toHaveBeenCalled();
  });

  it('bills each pass from its own record, mixing reported and counted usage', async () => {
    mockCompactConversation.mockResolvedValue({
      summary: SUMMARY,
      messagesCompacted: 6,
      provider: 'openAI',
      model: 'gpt-4o-mini',
      passes: [
        {
          usage: { model: 'gpt-4o-mini', provider: 'openAI', input_tokens: 900, output_tokens: 80 },
          counted: { input_tokens: 800, output_tokens: 70 },
        },
        /** Gateway omitted usage for this call only. */
        { counted: { input_tokens: 640, output_tokens: 55 } },
      ],
    });

    const deps = makeDeps();
    const result = await handleCompactRequest({ req: makeReq(), res }, deps);

    expect(result.status).toBe(201);
    const saved = (deps.saveMessage as jest.Mock).mock.calls[0][1];
    /** Reported 900/80 plus counted 640/55: neither call goes unbilled. */
    expect(saved.metadata.usage).toMatchObject({ input: 1540, output: 135 });
  });

  it('reports an already-compacted branch as its own code', async () => {
    mockCompactConversation.mockRejectedValue(new NothingToCompactError());
    const result = await handleCompactRequest({ req: makeReq(), res }, makeDeps());
    expect(result).toMatchObject({ status: 400, code: CompactErrorCodes.NOTHING_TO_COMPACT });
    expect(mockDecrement).toHaveBeenCalledWith('user_1');
  });
});
