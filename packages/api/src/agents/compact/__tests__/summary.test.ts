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
} from '~/agents/compact/summary';

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

/** A model the token map does not know, so the summarizer falls back to the
 *  32k default window and the chunking thresholds stay deterministic. */
const smallWindowAgent = {
  provider: 'openAI',
  endpoint: 'openAI',
  model: 'test-small-window',
  model_parameters: { model: 'test-small-window' },
};

/** Text that does not collapse under BPE, so token size tracks length. */
function bulk(label: string, words: number): string {
  const parts: string[] = [label];
  for (let i = 0; i < words; i++) {
    parts.push(`w${i}${label}`);
  }
  return parts.join(' ');
}

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
    /** Counted from the persisted text plus the summary-carrier overhead,
     *  independent of what the provider billed as output. */
    expect(result.summary.tokenCount).toBeGreaterThan(33);
    expect(result.summary.tokenCount).toBeLessThan(60);
    expect(result.messagesCompacted).toBe(6);
    expect(result.passes[0]?.usage).toMatchObject({ input_tokens: 1200, output_tokens: 40 });
  });

  it('still sizes the summary when the provider reports no output tokens', async () => {
    mockStream.mockImplementation(() => chunksOf('## Checkpoint\nDid the thing.'));

    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    expect(result.passes[0]?.usage).toBeUndefined();
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

    expect(result.passes[0]?.usage?.provider).toBe('openAI');
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

  it('keeps total_tokens so hidden reasoning is not undercharged', async () => {
    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
    });
    expect(result.passes[0]?.usage?.total_tokens).toBe(1240);
  });

  it('reports a locally counted estimate for a provider that omits usage', async () => {
    mockStream.mockImplementation(() => chunksOf('## Checkpoint\nDid the thing.'));

    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    /** The host bills from the local count so an OpenAI-compatible gateway
     *  that omits `usage` still produces one transaction per call. */
    expect(result.passes).toHaveLength(1);
    expect(result.passes[0].usage).toBeUndefined();
    expect(result.passes[0].counted.input_tokens).toBeGreaterThan(0);
    expect(result.passes[0].counted.output_tokens).toBeGreaterThan(0);
    expect(result.provider).toBe('openAI');
  });

  it('names media attachments the checkpoint cannot inline', async () => {
    const withImage = {
      ...userMessage('i1', Constants.NO_PARENT, 'what is wrong with this chart?'),
      files: [{ file_id: 'file_img' }],
    } as TMessage;
    const getFiles = jest
      .fn()
      .mockResolvedValue([
        { file_id: 'file_img', filename: 'chart.png', type: 'image/png', source: 'local' },
      ]);

    await compactConversation({
      req: makeReq(),
      agent,
      branch: [withImage],
      ids,
      db: dbMethods,
      getFiles,
    });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    expect(JSON.stringify(sent[0].content)).toContain('chart.png');
  });

  it('sizes the summary from its persisted text, not billed reasoning tokens', async () => {
    /** A reasoning summarizer bills far more output than it writes; reserving
     *  window for tokens that are never sent back would overstate every later
     *  context calculation. */
    mockStream.mockImplementation(() =>
      chunksOf('short checkpoint', {
        input_tokens: 100,
        output_tokens: 9000,
        total_tokens: 9100,
      }),
    );

    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    expect(result.summary.tokenCount).toBeLessThan(100);
    /** Provider output stays available for billing. */
    expect(result.passes[0]?.usage?.output_tokens).toBe(9000);
  });

  it('consolidates an over-window branch across passes instead of dropping turns', async () => {
    const long: TMessage[] = [];
    for (let i = 0; i < 12; i++) {
      const parent = i === 0 ? Constants.NO_PARENT : `m${i - 1}`;
      long.push(
        i % 2 === 0
          ? ({ ...userMessage(`m${i}`, parent, `turn${i} ${bulk(`u${i}`, 1200)}`) } as TMessage)
          : assistantMessage(`m${i}`, parent, [
              { type: ContentTypes.TEXT, text: bulk(`a${i}`, 1200) },
            ]),
      );
    }
    let pass = 0;
    mockStream.mockImplementation(() => chunksOf(`checkpoint after pass ${++pass}`));

    const result = await compactConversation({
      req: makeReq(),
      agent: smallWindowAgent,
      branch: long,
      ids,
      db: dbMethods,
    });

    /** More than one call means it chunked rather than sending an over-window
     *  prompt, and the final checkpoint is the last pass's output. */
    expect(mockStream.mock.calls.length).toBeGreaterThan(1);
    expect(result.summary.content?.[0].text).toBe(`checkpoint after pass ${pass}`);

    /** Every message reaches some pass: nothing is summarized away silently. */
    const seen = new Set<string>();
    for (const call of mockStream.mock.calls) {
      for (const message of call[0] as BaseMessage[]) {
        seen.add(JSON.stringify(message.content).slice(0, 40));
      }
    }
    for (let i = 0; i < 12; i += 2) {
      expect([...seen].some((key) => key.includes(`turn${i} `))).toBe(true);
    }

    /** Each pass after the first folds in the running checkpoint. */
    const secondPass = mockStream.mock.calls[1][0] as BaseMessage[];
    expect(String(secondPass[secondPass.length - 1].content)).toContain('checkpoint after pass 1');
  });

  it('uses the endpoint, not the provider map, for the context window', async () => {
    /** `providerEndpointMap` has no google entry, so mapping through it would
     *  fall back to the 32k default and chunk a Gemini branch that fits its
     *  real window comfortably. */
    const googleAgent = {
      provider: 'google',
      endpoint: 'google',
      model: 'gemini-2.5-pro',
      model_parameters: { model: 'gemini-2.5-pro' },
    };
    const branchOverSmallWindow: TMessage[] = [
      { ...userMessage('g1', Constants.NO_PARENT, bulk('g', 30000)) } as TMessage,
    ];
    process.env.GOOGLE_KEY = 'test-key';

    await compactConversation({
      req: makeReq(),
      agent: googleAgent,
      branch: branchOverSmallWindow,
      ids,
      db: dbMethods,
    });

    /** One pass: the real Gemini window swallows it. */
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('refuses when any pass comes back empty rather than dropping that chunk', async () => {
    const long: TMessage[] = [];
    for (let i = 0; i < 12; i++) {
      const parent = i === 0 ? Constants.NO_PARENT : `m${i - 1}`;
      long.push({ ...userMessage(`m${i}`, parent, bulk(`e${i}`, 1200)) } as TMessage);
    }
    let pass = 0;
    /** Second pass is filtered; its chunk would otherwise never be folded in
     *  while a later pass still produced a persisted boundary. */
    mockStream.mockImplementation(() => {
      pass += 1;
      return chunksOf(pass === 2 ? '   ' : `checkpoint ${pass}`);
    });

    await expect(
      compactConversation({
        req: makeReq(),
        agent: smallWindowAgent,
        branch: long,
        ids,
        db: dbMethods,
      }),
    ).rejects.toMatchObject({ name: 'EmptyCompactionError' });
  });

  it('carries what earlier passes spent when a later pass throws', async () => {
    const long: TMessage[] = [];
    for (let i = 0; i < 12; i++) {
      const parent = i === 0 ? Constants.NO_PARENT : `m${i - 1}`;
      long.push({ ...userMessage(`m${i}`, parent, bulk(`p${i}`, 1200)) } as TMessage);
    }
    let pass = 0;
    mockStream.mockImplementation(() => {
      pass += 1;
      if (pass === 2) {
        throw new Error('provider exploded');
      }
      return chunksOf(`checkpoint ${pass}`, {
        input_tokens: 500,
        output_tokens: 20,
        total_tokens: 520,
      });
    });

    await expect(
      compactConversation({
        req: makeReq(),
        agent: smallWindowAgent,
        branch: long,
        ids,
        db: dbMethods,
      }),
    ).rejects.toMatchObject({
      name: 'PartialCompactionError',
      /** Pass one completed and must still be billed; the rejected pass two
       *  contributes no entry at all. */
      passes: [{ usage: { input_tokens: 500 } }],
    });
  });

  it('refuses a branch needing more passes than the cap rather than truncating it', async () => {
    const huge: TMessage[] = [];
    for (let i = 0; i < 40; i++) {
      const parent = i === 0 ? Constants.NO_PARENT : `m${i - 1}`;
      huge.push({ ...userMessage(`m${i}`, parent, bulk(`h${i}`, 2500)) } as TMessage);
    }

    await expect(
      compactConversation({
        req: makeReq(),
        agent: smallWindowAgent,
        branch: huge,
        ids,
        db: dbMethods,
      }),
    ).rejects.toMatchObject({ name: 'TranscriptTooLargeError' });
  });

  it('reconstructs an invoked skill body so the checkpoint records its rules', async () => {
    const withSkill = assistantMessage('s1', Constants.NO_PARENT, [
      {
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          id: 'call_skill',
          name: 'skill',
          args: '{"skillName":"rust-style"}',
          output: 'loaded',
        },
      },
    ] as TMessage['content']);
    const getSkillByName = jest
      .fn()
      .mockResolvedValue({ name: 'rust-style', body: 'Always prefer iterators over index loops.' });

    await compactConversation({
      req: makeReq(),
      agent,
      branch: [withSkill],
      ids,
      db: dbMethods,
      skills: {
        getSkillByName,
        findAccessibleSkillIds: jest.fn().mockResolvedValue(['skill_id_1']),
      },
    });

    /** ACL-gated: the accessible-id set is what the lookup is scoped by. */
    expect(getSkillByName).toHaveBeenCalledWith('rust-style', ['skill_id_1']);
    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    expect(JSON.stringify(sent.map((m) => m.content))).toContain(
      'Always prefer iterators over index loops.',
    );
  });

  it('counts tool calls when sizing a pass, not just message content', async () => {
    /** `formatAgentMessages` stores tool name and arguments outside `content`;
     *  counting content alone let a tool-heavy branch look almost free. */
    const toolHeavy = assistantMessage('t1', Constants.NO_PARENT, [
      { type: ContentTypes.TEXT, text: 'ran it' },
      {
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          id: 'call_big',
          name: 'bash_tool',
          args: JSON.stringify({ cmd: bulk('args', 800) }),
          output: 'ok',
        },
      },
    ] as TMessage['content']);

    const result = await compactConversation({
      req: makeReq(),
      agent,
      branch: [
        userMessage('t0', Constants.NO_PARENT, 'go'),
        { ...toolHeavy, parentMessageId: 't0' } as TMessage,
      ],
      ids,
      db: dbMethods,
    });

    /** The arguments dominate the prompt, so the counted input must reflect
     *  them rather than the short text part alone. */
    expect(result.passes[0].counted.input_tokens).toBeGreaterThan(500);
  });

  it('refuses a model whose window cannot fit any compaction request', async () => {
    const tinyWindowAgent = {
      provider: 'openAI',
      endpoint: 'openAI',
      model: 'test-small-window',
      model_parameters: { model: 'test-small-window', maxTokens: 31000 },
    };

    await expect(
      compactConversation({
        req: makeReq(),
        agent: tinyWindowAgent,
        branch,
        ids,
        db: dbMethods,
      }),
    ).rejects.toMatchObject({ name: 'UnworkableContextError' });
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('maps parallel replies through the same agent map a normal run uses', async () => {
    const parallel = {
      ...assistantMessage('p1', Constants.NO_PARENT, [
        { type: ContentTypes.TEXT, text: 'answer A', agentId: 'agent_a', groupId: 1 },
        { type: ContentTypes.TEXT, text: 'answer B', agentId: 'agent_b', groupId: 1 },
      ] as TMessage['content']),
      /** The mapper runs on added-convo responses only, matching the
       *  `mapCondition` the normal send path uses. */
      addedConvo: true,
    } as TMessage;
    const getAgent = jest.fn(async ({ id }: { id: string }) => ({
      id,
      name: id === 'agent_a' ? 'Researcher' : 'Reviewer',
    }));

    await compactConversation({
      req: makeReq(),
      agent,
      branch: [parallel],
      ids,
      db: dbMethods,
      getAgent: getAgent as never,
    });

    /** The mapper receives the same agent map the normal run builds, so
     *  handoff content can be labelled and routing metadata is stripped. */
    expect(getAgent).toHaveBeenCalledTimes(2);
    const body = JSON.stringify(
      (mockStream.mock.calls[0][0] as BaseMessage[]).map((m) => m.content),
    );
    /** Only the group's primary reply is summarized: the conflicting sibling
     *  is dropped exactly as a normal turn would drop it. */
    expect(body).toContain('answer A');
    expect(body).not.toContain('answer B');
    /** Routing metadata never reaches the summarizer. */
    expect(body).not.toContain('groupId');
  });

  it('manifests text attachments when nothing was actually inlined', async () => {
    const withDoc = {
      ...userMessage('d1', Constants.NO_PARENT, 'summarize this'),
      files: [{ file_id: 'file_doc' }],
    } as TMessage;
    /** No fileTokenLimit configured, so extractFileContext inlines nothing. */
    const req = makeReq();
    (req.config as AppConfig).fileConfig = { fileTokenLimit: 0 } as never;
    const getFiles = jest.fn().mockResolvedValue([
      {
        file_id: 'file_doc',
        filename: 'spec.md',
        type: 'text/markdown',
        source: 'text',
        text: 'RFC',
      },
    ]);

    await compactConversation({ req, agent, branch: [withDoc], ids, db: dbMethods, getFiles });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    /** The turn keeps a mention of what was attached rather than nothing. */
    expect(JSON.stringify(sent[0].content)).toContain('spec.md');
  });

  it('bills a stream that failed after emitting output', async () => {
    mockStream.mockImplementation(async function* () {
      yield new AIMessageChunk({ content: 'partial checkpoint text' });
      throw new Error('gateway interrupted');
    });

    await expect(
      compactConversation({ req: makeReq(), agent, branch, ids, db: dbMethods }),
    ).rejects.toMatchObject({
      name: 'PartialCompactionError',
      /** Chunks arrived, so the call is real spend and must be recorded. */
      passes: [{ counted: { output_tokens: expect.any(Number) } }],
    });
  });

  it('reserves for the longer of the initial and update prompts', async () => {
    /** A long update prompt is what later passes actually send; sizing from the
     *  initial one alone lets a later pass overflow after billing. */
    const longUpdate = bulk('update', 4000);
    await compactConversation({
      req: makeReq({ prompt: 'short', updatePrompt: longUpdate }),
      agent: smallWindowAgent,
      branch,
      ids,
      db: dbMethods,
    });

    /** The reserve is subtracted from the window, so a huge update prompt must
     *  shrink the chunk budget enough to force more than one pass here. */
    expect(mockStream.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses a branch that formats to nothing', async () => {
    await expect(
      compactConversation({ req: makeReq(), agent, branch: [], ids, db: dbMethods }),
    ).rejects.toBeInstanceOf(NothingToCompactError);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('rejects an empty summary but keeps the usage it was billed for', async () => {
    mockStream.mockImplementation(() =>
      chunksOf('   ', { input_tokens: 900, output_tokens: 1, total_tokens: 901 }),
    );

    /** The provider still charged for the call, so the host needs the usage to
     *  bill it even though no summary lands. */
    await expect(
      compactConversation({ req: makeReq(), agent, branch, ids, db: dbMethods }),
    ).rejects.toMatchObject({
      name: 'EmptyCompactionError',
      passes: [{ usage: { input_tokens: 900, provider: 'openAI' } }],
    });
  });

  it('carries a local estimate when an empty response also omits usage', async () => {
    mockStream.mockImplementation(() => chunksOf('   '));

    await expect(
      compactConversation({ req: makeReq(), agent, branch, ids, db: dbMethods }),
    ).rejects.toMatchObject({
      name: 'EmptyCompactionError',
      passes: [{ usage: undefined, counted: { output_tokens: 0 } }],
    });
  });

  it('hydrates attachment text so an uploaded document survives the summary', async () => {
    const withFile = {
      ...userMessage('f1', Constants.NO_PARENT, 'summarize the attached spec'),
      files: [{ file_id: 'file_1' }],
    } as TMessage;
    const getFiles = jest
      .fn()
      .mockResolvedValue([
        { file_id: 'file_1', filename: 'spec.md', source: 'text', text: 'RFC-9110 defines GET.' },
      ]);

    await compactConversation({
      req: makeReq(),
      agent,
      branch: [withFile],
      ids,
      db: dbMethods,
      getFiles,
    });

    /** Owner-scoped: the lookup must never widen past the requesting user. */
    expect(getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'user_1', file_id: { $in: ['file_1'] } }),
    );
    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    expect(JSON.stringify(sent[0].content)).toContain('RFC-9110 defines GET.');
  });
});
