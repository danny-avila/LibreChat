import { Constants, ContentTypes } from 'librechat-data-provider';
import type { BaseMessage } from '@langchain/core/messages';
import type { AppConfig } from '@librechat/data-schemas';
import type { TMessage } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

/** Only the provider call is replaced. `formatMessage`, `formatAgentMessages`
 *  and the summary-boundary scan all run for real, which is the whole point of
 *  these tests. */
const mockInvoke = jest.fn();
const mockStream = jest.fn();
const mockModel: { invoke: jest.Mock; stream?: jest.Mock } = {
  invoke: mockInvoke,
  stream: mockStream,
};
const mockInitializeModel = jest.fn(
  (_params: { provider: string; clientOptions?: Record<string, unknown> }) => mockModel,
);
jest.mock('@librechat/agents', () => {
  const actual = jest.requireActual('@librechat/agents');
  return {
    ...actual,
    initializeModel: (params: { provider: string; clientOptions?: Record<string, unknown> }) =>
      mockInitializeModel(params),
  };
});

import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import {
  compactConversation,
  selectBranchMessages,
  NothingToCompactError,
  buildCompactionInstruction,
  DEFAULT_COMPACTION_PROMPT,
  DEFAULT_COMPACTION_UPDATE_PROMPT,
} from '~/agents/compact';

function userMessage(id: string, parentMessageId: string, text: string): TMessage {
  return {
    messageId: id,
    parentMessageId,
    conversationId: 'convo_1',
    isCreatedByUser: true,
    sender: 'User',
    text,
  } as TMessage;
}

function assistantMessage(
  id: string,
  parentMessageId: string,
  content: TMessage['content'],
): TMessage {
  return {
    messageId: id,
    parentMessageId,
    conversationId: 'convo_1',
    isCreatedByUser: false,
    sender: 'Assistant',
    text: '',
    content,
  } as TMessage;
}

const agent = {
  provider: 'openAI',
  endpoint: 'openAI',
  model: 'gpt-4o-mini',
  model_parameters: { model: 'gpt-4o-mini' },
};

function makeReq(summarization?: AppConfig['summarization']): ServerRequest {
  return {
    body: {},
    user: { id: 'user_1' },
    config: { endpoints: {}, summarization } as AppConfig,
  } as unknown as ServerRequest;
}

const dbMethods = {
  getUserKey: jest.fn().mockResolvedValue(''),
  getUserKeyValues: jest.fn().mockResolvedValue({}),
};

const ids = { messageId: 'new_1', conversationId: 'convo_1', parentMessageId: 'm4' };

/** Chunked provider response: usage lands on the final chunk, as it does on
 *  the wire, so the aggregation has to survive the merge to be read. */
async function* chunksOf(
  text: string,
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number },
) {
  const slices = text.match(/[\s\S]{1,12}/g) ?? [text];
  for (let i = 0; i < slices.length; i++) {
    yield new AIMessageChunk({
      content: slices[i],
      ...(usage != null && i === slices.length - 1 ? { usage_metadata: usage } : {}),
    });
  }
}

describe('selectBranchMessages', () => {
  const root = userMessage('m1', Constants.NO_PARENT, 'first');
  const reply = assistantMessage('m2', 'm1', [{ type: ContentTypes.TEXT, text: 'hello' }]);
  const sibling = assistantMessage('m3', 'm1', [{ type: ContentTypes.TEXT, text: 'other' }]);
  const messages = [root, reply, sibling];

  it('returns the branch oldest-first', () => {
    expect(selectBranchMessages(messages, 'm2').map((m) => m.messageId)).toEqual(['m1', 'm2']);
  });

  it('follows only the requested sibling', () => {
    expect(selectBranchMessages(messages, 'm3').map((m) => m.messageId)).toEqual(['m1', 'm3']);
  });

  it('returns nothing for an unknown or absent leaf', () => {
    expect(selectBranchMessages(messages, 'missing')).toEqual([]);
    expect(selectBranchMessages(messages, undefined)).toEqual([]);
  });

  it('breaks out of a parent cycle instead of looping forever', () => {
    const a = userMessage('a', 'b', 'a');
    const b = assistantMessage('b', 'a', [{ type: ContentTypes.TEXT, text: 'b' }]);
    expect(selectBranchMessages([a, b], 'a').map((m) => m.messageId)).toEqual(['b', 'a']);
  });
});

describe('buildCompactionInstruction', () => {
  it('sends the base prompt when there is no prior summary', () => {
    expect(buildCompactionInstruction('base', 'update')).toBe('base');
    expect(buildCompactionInstruction('base', 'update', '   ')).toBe('base');
  });

  it('switches to the update prompt and carries the prior summary', () => {
    const result = buildCompactionInstruction('base', 'update', 'earlier checkpoint');
    expect(result).toContain('update');
    expect(result).toContain('<previous-summary>\nearlier checkpoint\n</previous-summary>');
    expect(result).not.toContain('base');
  });
});

describe('compactConversation', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeAll(() => {
    process.env.OPENAI_API_KEY = 'sk-test';
  });

  afterAll(() => {
    if (originalKey == null) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalKey;
    }
  });

  beforeEach(() => {
    mockInvoke.mockReset();
    mockStream.mockReset();
    mockInitializeModel.mockClear();
    mockModel.stream = mockStream;
    mockStream.mockImplementation(() =>
      chunksOf('## Checkpoint\nDid the thing.', {
        input_tokens: 1200,
        output_tokens: 40,
        total_tokens: 1240,
      }),
    );
  });

  const branch: TMessage[] = [
    userMessage('m1', Constants.NO_PARENT, 'list the files'),
    assistantMessage('m2', 'm1', [
      { type: ContentTypes.TEXT, text: 'Running it now' },
      {
        type: ContentTypes.TOOL_CALL,
        tool_call: { id: 'call_1', name: 'bash_tool', args: '{"cmd":"ls"}', output: 'a.ts b.ts' },
      },
    ] as TMessage['content']),
    userMessage('m3', 'm2', 'thanks'),
    assistantMessage('m4', 'm3', [{ type: ContentTypes.TEXT, text: 'anytime' }]),
  ];

  it('sends the whole branch plus the compaction instruction', async () => {
    await compactConversation({ req: makeReq(), agent, branch, ids, db: dbMethods });

    expect(mockStream).toHaveBeenCalledTimes(1);
    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    const types = sent.map((message) => message.getType());
    /** The assistant turn's tool_call is reconstructed into an AIMessage +
     *  ToolMessage pair rather than leaking through as a raw content block. */
    expect(types).toEqual(['human', 'ai', 'tool', 'ai', 'human', 'ai', 'human']);
    expect(sent[sent.length - 1].content).toBe(DEFAULT_COMPACTION_PROMPT);
  });

  it('returns a summary content part shaped like the automatic detour writes', async () => {
    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    expect(result.summary.type).toBe(ContentTypes.SUMMARY);
    expect(result.summary.content).toEqual([
      { type: ContentTypes.TEXT, text: '## Checkpoint\nDid the thing.' },
    ]);
    expect(result.summary.provider).toBe('openAI');
    expect(result.summary.model).toBe('gpt-4o-mini');
    /** Reported output tokens plus the summary-carrier overhead. */
    expect(result.summary.tokenCount).toBe(73);
    expect(result.messagesCompacted).toBe(6);
    expect(result.usage).toMatchObject({ input_tokens: 1200, output_tokens: 40 });
  });

  it('counts the summary itself when the provider reports no output tokens', async () => {
    mockStream.mockImplementation(() => chunksOf('## Checkpoint\nDid the thing.'));

    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    expect(result.usage).toBeUndefined();
    expect(result.summary.tokenCount).toBeGreaterThan(33);
  });

  it('consolidates an earlier summary and drops the messages it replaced', async () => {
    const withPriorSummary: TMessage[] = [
      ...branch,
      assistantMessage('m5', 'm4', [
        {
          type: ContentTypes.SUMMARY,
          content: [{ type: ContentTypes.TEXT, text: 'earlier checkpoint' }],
          tokenCount: 80,
        },
      ] as TMessage['content']),
      userMessage('m6', 'm5', 'keep going'),
    ];

    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch: withPriorSummary,
      ids,
      db: dbMethods,
    });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    /** Everything before the summary boundary is gone; only the post-boundary
     *  turn and the instruction remain. */
    expect(sent.map((message) => message.getType())).toEqual(['human', 'human']);
    expect(sent[0].content).toEqual([{ type: ContentTypes.TEXT, text: 'keep going' }]);
    expect(sent[1].content).toContain(DEFAULT_COMPACTION_UPDATE_PROMPT);
    expect(sent[1].content).toContain('earlier checkpoint');
    expect(result.messagesCompacted).toBe(1);
  });

  it('honors an admin-configured compaction prompt', async () => {
    await compactConversation({
      req: makeReq({ prompt: 'Summarize tersely.' }),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    expect(sent[sent.length - 1].content).toBe('Summarize tersely.');
  });

  it('falls back to a plain invoke for a model that cannot stream', async () => {
    mockModel.stream = undefined;
    mockInvoke.mockResolvedValue(new AIMessage('## Checkpoint\nDid the thing.'));

    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result.summary.content).toEqual([
      { type: ContentTypes.TEXT, text: '## Checkpoint\nDid the thing.' },
    ]);
  });

  it('merges quoted excerpts into the transcript it summarizes', async () => {
    const quoted = {
      ...userMessage('q1', Constants.NO_PARENT, 'what does this do?'),
      quotes: ['fn parse(input: &str) -> Result<Record, Error>'],
    } as TMessage;

    await compactConversation({
      req: makeReq(),
      agent,
      branch: [quoted],
      ids,
      db: dbMethods,
    });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    /** Dropping the quote would silently lose the referenced material once the
     *  summary becomes the boundary. */
    expect(JSON.stringify(sent[0].content)).toContain('fn parse(input: &str)');
    expect(JSON.stringify(sent[0].content)).toContain('what does this do?');
  });

  it('tags the usage with the provider so cached input is not billed twice', async () => {
    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    expect(result.usage?.provider).toBe('openAI');
  });

  it('applies admin summarization parameters and the summary output cap', async () => {
    await compactConversation({
      req: makeReq({ parameters: { temperature: 0.1 }, maxSummaryTokens: 512 }),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    const clientOptions = mockInitializeModel.mock.calls[0]?.[0]?.clientOptions ?? {};
    expect(clientOptions.temperature).toBe(0.1);
    expect(clientOptions.maxTokens).toBe(512);
  });

  it('runs the pre-flight gate before contacting the provider, and aborts when it throws', async () => {
    const order: string[] = [];
    mockStream.mockImplementation(() => {
      order.push('invoke');
      return chunksOf('## Checkpoint');
    });

    await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
      beforeInvoke: async ({ promptTokens, provider }) => {
        order.push('gate');
        expect(promptTokens).toBeGreaterThan(0);
        expect(provider).toBe('openAI');
      },
    });
    expect(order).toEqual(['gate', 'invoke']);

    mockStream.mockClear();
    await expect(
      compactConversation({
        req: makeReq(),
        agent,
        branch,
        ids,
        db: dbMethods,
        beforeInvoke: async () => {
          throw new Error('Insufficient balance');
        },
      }),
    ).rejects.toThrow('Insufficient balance');
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('refuses a branch that formats to nothing', async () => {
    await expect(
      compactConversation({ req: makeReq(), agent, branch: [], ids, db: dbMethods }),
    ).rejects.toBeInstanceOf(NothingToCompactError);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('rejects an empty summary rather than persisting a useless boundary', async () => {
    mockStream.mockImplementation(() => chunksOf('   '));

    await expect(
      compactConversation({ req: makeReq(), agent, branch, ids, db: dbMethods }),
    ).rejects.toThrow('Compaction produced empty output');
  });
});
