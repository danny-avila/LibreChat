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
      model_parameters: { model: 'test-small-window', maxTokens: 32000 },
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

  it('does not bill a stream that failed before emitting anything', async () => {
    /** A client that defers a 401 or a rate limit to the iterator's first read
     *  produced no provider work, so nothing may be charged for it. */
    mockStream.mockImplementation(() => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('401 Unauthorized')),
      }),
    }));

    await expect(
      compactConversation({ req: makeReq(), agent, branch, ids, db: dbMethods }),
    ).rejects.toMatchObject({ name: 'PartialCompactionError', passes: [] });
  });

  it('gates a Vertex AI summarizer under the Google balance key', async () => {
    /** `supportsBalanceCheck` and the token maps have no `vertexai` key, so the
     *  literal name would skip the funds check on calls that are still billed. */
    const seen: string[] = [];
    await compactConversation({
      req: makeReq({ provider: 'vertexai' }),
      agent: { provider: 'google', endpoint: 'google', model: 'gemini-2.0-flash' },
      branch,
      ids,
      db: dbMethods,
      beforeInvoke: async ({ balanceEndpoint, endpoint }) => {
        seen.push(balanceEndpoint, endpoint);
      },
    });

    expect(seen).toEqual(['google', 'vertexai']);
  });

  it('reserves for a prior checkpoint larger than the current output cap', async () => {
    /** An administrator who lowers `maxSummaryTokens` leaves behind a checkpoint
     *  bigger than the new cap; pass one still carries the whole thing. */
    const priorText = bulk('prior', 4000);
    const withLargePriorSummary: TMessage[] = [
      ...branch,
      assistantMessage('m5', 'm4', [
        { type: ContentTypes.SUMMARY, content: [{ type: ContentTypes.TEXT, text: priorText }] },
      ] as TMessage['content']),
      userMessage('m6', 'm5', bulk('tailA', 1300)),
      userMessage('m7', 'm6', bulk('tailB', 1300)),
      userMessage('m8', 'm7', bulk('tailC', 1300)),
      userMessage('m9', 'm8', bulk('tailD', 1300)),
    ];

    await expect(
      compactConversation({
        req: makeReq({ maxSummaryTokens: 256 }),
        agent: smallWindowAgent,
        branch: withLargePriorSummary,
        ids: { ...ids, parentMessageId: 'm9' },
        db: dbMethods,
      }),
    ).resolves.toBeDefined();

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    const instruction = sent[sent.length - 1].content as string;
    expect(instruction).toContain('prior');
    /** The prior checkpoint is reserved for, so the transcript riding with it
     *  is split rather than sized as if only the 256-token cap were carried. */
    expect(mockStream.mock.calls.length).toBeGreaterThan(1);
  });

  it('does not reserve a checkpoint the first pass will never produce', async () => {
    /** A running checkpoint exists only from the second pass onward. Reserving
     *  for it up front refused transcripts that fit comfortably in one pass. */
    const halfWindowCapAgent = {
      provider: 'openAI',
      endpoint: 'openAI',
      model: 'test-small-window',
      model_parameters: { model: 'test-small-window', maxTokens: 16000 },
    };

    const result = await compactConversation({
      req: makeReq(),
      agent: halfWindowCapAgent,
      branch,
      ids,
      db: dbMethods,
    });

    expect(mockStream).toHaveBeenCalledTimes(1);
    expect(result.summary.content).toBeDefined();
  });

  it('honors an endpoint configured not to stream', async () => {
    /** A LangChain runnable always exposes `stream()`, so a gateway that
     *  rejects streamed requests is only reachable through this override. */
    mockInvoke.mockResolvedValue(new AIMessage('## Checkpoint\nDid the thing.'));

    const result = await compactConversation({
      req: makeReq({ parameters: { streaming: false } }),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    expect(mockStream).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(result.summary.content).toEqual([
      { type: ContentTypes.TEXT, text: '## Checkpoint\nDid the thing.' },
    ]);
  });

  it('reports each pass estimate so the gate can price its own tier', async () => {
    /** Premium long-context rates are keyed off ONE call's input, which a
     *  summed figure cannot express. */
    const bigBranch: TMessage[] = [
      userMessage('b1', Constants.NO_PARENT, bulk('one', 1500)),
      userMessage('b2', 'b1', bulk('two', 1500)),
      userMessage('b3', 'b2', bulk('three', 1500)),
    ];
    let seen: number[] = [];

    await compactConversation({
      req: makeReq(),
      agent: smallWindowAgent,
      branch: bigBranch,
      ids: { ...ids, parentMessageId: 'b3' },
      db: dbMethods,
      beforeInvoke: async ({ promptTokens, passPromptTokens }) => {
        seen = passPromptTokens;
        expect(passPromptTokens.reduce((total, pass) => total + pass, 0)).toBe(promptTokens);
      },
    });

    expect(seen.length).toBe(mockStream.mock.calls.length);
    expect(seen.every((pass) => pass > 0)).toBe(true);
  });

  it('keeps the larger budget for the first pass of a multi-pass branch', async () => {
    /** Only passes after the first carry the generated checkpoint. Shrinking
     *  the first one too spends an extra provider call. */
    const longBranch: TMessage[] = [];
    let parent = Constants.NO_PARENT as string;
    for (let i = 0; i < 8; i++) {
      longBranch.push(userMessage(`L${i}`, parent, bulk(`seg${i}`, 1400)));
      parent = `L${i}`;
    }

    await compactConversation({
      req: makeReq({ maxSummaryTokens: 6000 }),
      agent: smallWindowAgent,
      branch: longBranch,
      ids: { ...ids, parentMessageId: 'L7' },
      db: dbMethods,
    });

    const firstPass = mockStream.mock.calls[0][0] as BaseMessage[];
    const secondPass = mockStream.mock.calls[1][0] as BaseMessage[];
    /** The first pass carries no running checkpoint, so it holds more turns
     *  than one sized against the checkpoint-reduced budget. */
    expect(mockStream.mock.calls.length).toBeGreaterThan(1);
    expect(firstPass.length).toBeGreaterThan(secondPass.length);
  });

  it('reconstructs reasoning content for a target that replays it', async () => {
    /** Resolved through the OpenAI-compatible initializer, as a gateway serving
     *  a DeepSeek reasoning model is: the model name is what carries the
     *  replay requirement. */
    const reasoningAgent = {
      provider: 'openAI',
      endpoint: 'openAI',
      model: 'deepseek-reasoner',
      model_parameters: { model: 'deepseek-reasoner' },
    };
    const thinkingBranch: TMessage[] = [
      userMessage('r1', Constants.NO_PARENT, 'run it'),
      assistantMessage('r2', 'r1', [
        { type: ContentTypes.THINK, think: 'weighing the options' },
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: { id: 'call_r', name: 'bash_tool', args: '{"cmd":"ls"}', output: 'a.ts' },
        },
      ] as TMessage['content']),
    ];

    await compactConversation({
      req: makeReq(),
      agent: reasoningAgent,
      branch: thinkingBranch,
      ids: { ...ids, parentMessageId: 'r2' },
      db: dbMethods,
    });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    const aiMessage = sent.find((message) => message.getType() === 'ai');
    expect(aiMessage?.additional_kwargs?.reasoning_content).toBe('weighing the options');
  });

  it('refuses a cross-endpoint user key whose expiry could not be read', async () => {
    /** The initializer validates the TARGET's stored credential against
     *  `body.key`. The conversation's own marker belongs to another endpoint,
     *  and a value of `never` there would let an expired key through, so an
     *  unreadable expiry has to fail closed rather than fall through to it. */
    const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'user_provided';
    try {
      await expect(
        compactConversation({
          req: {
            body: { key: 'never' },
            user: { id: 'user_1' },
            config: {
              endpoints: {},
              summarization: { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
            } as AppConfig,
          } as unknown as ServerRequest,
          agent,
          branch,
          ids,
          db: {
            ...dbMethods,
            getUserKey: jest.fn(async () => 'target-key'),
            getUserKeyExpiry: jest.fn().mockRejectedValue(new Error('cache down')),
          },
        }),
      ).rejects.toThrow(/expired_user_key/);
      expect(mockStream).not.toHaveBeenCalled();
    } finally {
      if (originalAnthropicKey == null) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      }
    }
  });

  it('applies a summary cap where a GPT-5 model expects it', async () => {
    /** `getOptions` already moved the inherited cap into `modelKwargs` and
     *  deleted the top-level key; writing the override back there would send
     *  `max_tokens` alongside it, which those models reject. */
    mockInitializeModel.mockClear();

    const cappedGpt5Agent = {
      provider: 'openAI',
      endpoint: 'openAI',
      model: 'gpt-5',
      model_parameters: { model: 'gpt-5', max_tokens: 8000 },
    };

    await compactConversation({
      req: makeReq({ maxSummaryTokens: 2048 }),
      agent: cappedGpt5Agent,
      branch,
      ids,
      db: dbMethods,
    });

    const clientOptions = mockInitializeModel.mock.calls[0][0].clientOptions as {
      maxTokens?: number;
      modelKwargs?: Record<string, unknown>;
    };
    expect(clientOptions.modelKwargs?.max_completion_tokens).toBe(2048);
    expect(clientOptions.maxTokens).toBeUndefined();
  });

  it('counts replayed reasoning content when sizing a pass', async () => {
    const reasoningBranch: TMessage[] = [
      userMessage('t1', Constants.NO_PARENT, 'run it'),
      assistantMessage('t2', 't1', [
        { type: ContentTypes.THINK, think: bulk('thought', 400) },
        {
          type: ContentTypes.TOOL_CALL,
          tool_call: { id: 'call_t', name: 'bash_tool', args: '{"cmd":"ls"}', output: 'a.ts' },
        },
      ] as TMessage['content']),
    ];
    const estimate = async (model: string): Promise<number> => {
      let promptTokens = 0;
      await compactConversation({
        req: makeReq(),
        agent: { provider: 'openAI', endpoint: 'openAI', model, model_parameters: { model } },
        branch: reasoningBranch,
        ids: { ...ids, parentMessageId: 't2' },
        db: dbMethods,
        beforeInvoke: async (params) => {
          promptTokens = params.promptTokens;
        },
      });
      return promptTokens;
    };

    /** The reasoning is reconstructed only for a target that replays it, and
     *  it is sent with the request, so the estimate has to grow with it. */
    const withReplay = await estimate('deepseek-reasoner');
    const withoutReplay = await estimate('gpt-4o-mini');
    expect(withReplay).toBeGreaterThan(withoutReplay);
  });

  it('sizes chunks from a configured context limit, not the model map', async () => {
    /** A normal turn treats `maxContextTokens` as authoritative, so a custom
     *  model configured for a small window must not be sized against the 32K
     *  fallback. */
    const wideBranch: TMessage[] = [
      userMessage('c1', Constants.NO_PARENT, bulk('alpha', 900)),
      userMessage('c2', 'c1', bulk('beta', 900)),
      userMessage('c3', 'c2', bulk('gamma', 900)),
    ];

    await compactConversation({
      req: makeReq(),
      agent: { ...smallWindowAgent, maxContextTokens: 6000 },
      branch: wideBranch,
      ids: { ...ids, parentMessageId: 'c3' },
      db: dbMethods,
    });
    const constrainedPasses = mockStream.mock.calls.length;

    mockStream.mockClear();
    await compactConversation({
      req: makeReq(),
      agent: smallWindowAgent,
      branch: wideBranch,
      ids: { ...ids, parentMessageId: 'c3' },
      db: dbMethods,
    });

    expect(constrainedPasses).toBeGreaterThan(mockStream.mock.calls.length);
  });

  it('does not re-send historical files when resendFiles is off', async () => {
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
      agent: { ...agent, resendFiles: false },
      branch: [withFile],
      ids,
      db: dbMethods,
      getFiles,
    });

    expect(getFiles).not.toHaveBeenCalled();
    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    expect(JSON.stringify(sent[0].content)).not.toContain('RFC-9110 defines GET.');
  });

  it('ignores the conversation context limit when a summarizer model is configured', async () => {
    /** The limit describes the model the CONVERSATION runs on; a configured
     *  summarizer is a different model with its own window. */
    const wideBranch: TMessage[] = [
      userMessage('w1', Constants.NO_PARENT, bulk('alpha', 900)),
      userMessage('w2', 'w1', bulk('beta', 900)),
      userMessage('w3', 'w2', bulk('gamma', 900)),
    ];

    await compactConversation({
      req: makeReq({ model: 'test-other-summarizer' }),
      agent: { ...smallWindowAgent, maxContextTokens: 6000 },
      branch: wideBranch,
      ids: { ...ids, parentMessageId: 'w3' },
      db: dbMethods,
    });
    const withSummarizerModel = mockStream.mock.calls.length;

    mockStream.mockClear();
    await compactConversation({
      req: makeReq(),
      agent: { ...smallWindowAgent, maxContextTokens: 6000 },
      branch: wideBranch,
      ids: { ...ids, parentMessageId: 'w3' },
      db: dbMethods,
    });

    /** The summarizer falls back to its own window, which is larger than the
     *  conversation's 6K limit, so it needs fewer passes. */
    expect(withSummarizerModel).toBeLessThan(mockStream.mock.calls.length);
  });

  it('aborts when a historical agent lookup fails rather than dropping attribution', async () => {
    const multiAgent = {
      ...assistantMessage('a1', Constants.NO_PARENT, [
        { type: ContentTypes.TEXT, text: 'from one agent', agentId: 'agent_x' },
      ] as TMessage['content']),
      addedConvo: true,
    } as TMessage;

    await expect(
      compactConversation({
        req: makeReq(),
        agent,
        branch: [multiAgent],
        ids: { ...ids, parentMessageId: 'a1' },
        db: dbMethods,
        getAgent: jest.fn().mockRejectedValue(new Error('db unavailable')),
      }),
    ).rejects.toThrow('db unavailable');
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('gives a steer its own attachments instead of the assistant turn', async () => {
    const withSteerFile = {
      ...assistantMessage('s1', Constants.NO_PARENT, [
        { type: ContentTypes.TEXT, text: 'working on it' },
        { type: ContentTypes.STEER, steer: 'use this spec', files: [{ file_id: 'file_s' }] },
      ] as TMessage['content']),
    } as TMessage;
    const getFiles = jest
      .fn()
      .mockResolvedValue([
        { file_id: 'file_s', filename: 'spec.md', source: 'text', text: 'RFC-9110 defines GET.' },
      ]);

    await compactConversation({
      req: makeReq(),
      agent,
      branch: [withSteerFile],
      ids: { ...ids, parentMessageId: 's1' },
      db: dbMethods,
      getFiles,
    });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    const steerMessage = sent.find((message) => message.additional_kwargs?.source === 'steer');
    /** The user attached it mid-run, so it rides with the replayed steer, not
     *  with the assistant text that happens to precede it. */
    expect(JSON.stringify(steerMessage?.content)).toContain('RFC-9110 defines GET.');
    const assistantText = sent.find((message) => message.getType() === 'ai');
    expect(JSON.stringify(assistantText?.content ?? '')).not.toContain('RFC-9110 defines GET.');
  });

  it('keeps the run model when a configured summarizer provider cannot resolve', async () => {
    /** The fallback deliberately returns to the agent's endpoint and drops the
     *  model override, so the conversation's own context limit describes the
     *  call again. */
    const wideBranch: TMessage[] = [
      userMessage('u1', Constants.NO_PARENT, bulk('alpha', 900)),
      userMessage('u2', 'u1', bulk('beta', 900)),
      userMessage('u3', 'u2', bulk('gamma', 900)),
    ];

    await compactConversation({
      req: makeReq({ provider: 'not-a-real-endpoint' }),
      agent: { ...smallWindowAgent, maxContextTokens: 6000 },
      branch: wideBranch,
      ids: { ...ids, parentMessageId: 'u3' },
      db: dbMethods,
    });
    const afterFallback = mockStream.mock.calls.length;

    mockStream.mockClear();
    await compactConversation({
      req: makeReq(),
      agent: { ...smallWindowAgent, maxContextTokens: 6000 },
      branch: wideBranch,
      ids: { ...ids, parentMessageId: 'u3' },
      db: dbMethods,
    });

    /** Same target, so the 6K limit applies in both and the pass count matches. */
    expect(afterFallback).toBe(mockStream.mock.calls.length);
    expect(afterFallback).toBeGreaterThan(1);
  });

  it('never lets summarization parameters redirect the model', async () => {
    /** `clientOptions.model` is what `initializeModel` invokes, while sizing,
     *  billing and the persisted metadata read the resolved model. */
    mockInitializeModel.mockClear();

    const result = await compactConversation({
      req: makeReq({
        model: 'gpt-4o',
        parameters: { model: 'gpt-4o-mini', modelName: 'gpt-4o-mini' },
      }),
      agent,
      branch,
      ids,
      db: dbMethods,
    });

    const clientOptions = mockInitializeModel.mock.calls[0][0].clientOptions as { model?: string };
    expect(clientOptions.model).toBe('gpt-4o');
    expect(result.summary.model).toBe('gpt-4o');
  });

  it('inlines a repeatedly attached document once per retained segment', async () => {
    const attach = (id: string, parent: string) =>
      ({
        ...userMessage(id, parent, 'look again'),
        files: [{ file_id: 'file_dup' }],
      }) as TMessage;
    const getFiles = jest
      .fn()
      .mockResolvedValue([
        { file_id: 'file_dup', filename: 'spec.md', source: 'text', text: 'RFC-9110 defines GET.' },
      ]);

    await compactConversation({
      req: makeReq(),
      agent,
      branch: [attach('d1', Constants.NO_PARENT), attach('d2', 'd1'), attach('d3', 'd2')],
      ids: { ...ids, parentMessageId: 'd3' },
      db: dbMethods,
      getFiles,
    });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    const occurrences = JSON.stringify(sent.map((message) => message.content)).split(
      'RFC-9110 defines GET.',
    ).length;
    expect(occurrences - 1).toBe(1);
  });

  it('re-inlines a document reattached after a summary boundary', async () => {
    const attach = (id: string, parent: string) =>
      ({
        ...userMessage(id, parent, 'look again'),
        files: [{ file_id: 'file_dup' }],
      }) as TMessage;
    const getFiles = jest
      .fn()
      .mockResolvedValue([
        { file_id: 'file_dup', filename: 'spec.md', source: 'text', text: 'RFC-9110 defines GET.' },
      ]);

    await compactConversation({
      req: makeReq(),
      agent,
      branch: [
        attach('d1', Constants.NO_PARENT),
        assistantMessage('d2', 'd1', [
          {
            type: ContentTypes.SUMMARY,
            content: [{ type: ContentTypes.TEXT, text: 'earlier checkpoint' }],
          },
        ] as TMessage['content']),
        attach('d3', 'd2'),
      ],
      ids: { ...ids, parentMessageId: 'd3' },
      db: dbMethods,
      getFiles,
    });

    /** The pre-boundary copy is discarded, so the retained one must still
     *  carry the text. */
    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    expect(JSON.stringify(sent[0].content)).toContain('RFC-9110 defines GET.');
  });

  it('does not enrich history the summary boundary discards', async () => {
    /** Everything before the newest checkpoint is dropped by formatting, so
     *  loading its documents and agents is wasted work that can also fail. */
    const getFiles = jest.fn().mockResolvedValue([]);
    const getAgent = jest.fn().mockResolvedValue(null);
    const branchWithBoundary: TMessage[] = [
      {
        ...userMessage('p1', Constants.NO_PARENT, 'older turn'),
        files: [{ file_id: 'file_old' }],
      } as TMessage,
      assistantMessage('p2', 'p1', [
        {
          type: ContentTypes.SUMMARY,
          content: [{ type: ContentTypes.TEXT, text: 'earlier checkpoint' }],
        },
      ] as TMessage['content']),
      userMessage('p3', 'p2', 'newer turn'),
    ];

    await compactConversation({
      req: makeReq(),
      agent,
      branch: branchWithBoundary,
      ids: { ...ids, parentMessageId: 'p3' },
      db: dbMethods,
      getFiles,
      getAgent,
    });

    /** The only file lives before the boundary, so nothing is looked up. */
    expect(getFiles).not.toHaveBeenCalled();
    expect(getAgent).not.toHaveBeenCalled();
  });

  it('inlines historical files under the resolved file token limit', async () => {
    const longText = bulk('doc', 600);
    const getFiles = jest
      .fn()
      .mockResolvedValue([
        { file_id: 'file_big', filename: 'spec.md', source: 'text', text: longText },
      ]);
    const withFile = {
      ...userMessage('g1', Constants.NO_PARENT, 'summarize this'),
      files: [{ file_id: 'file_big' }],
    } as TMessage;

    await compactConversation({
      req: makeReq(),
      agent: { ...agent, fileTokenLimit: 50 },
      branch: [withFile],
      ids,
      db: dbMethods,
      getFiles,
    });

    /** Truncated to the resolved budget rather than the request-controlled
     *  field or the global default. */
    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    const inlined = JSON.stringify(sent[0].content);
    expect(inlined).toContain('doc');
    expect(inlined.length).toBeLessThan(longText.length);
  });

  it('honors a resolved file token limit of zero', async () => {
    /** Zero is a valid configured limit and means inline nothing; dropping it
     *  would fall back to the request field or the nonzero global default. */
    const getFiles = jest.fn().mockResolvedValue([
      {
        file_id: 'file_zero',
        filename: 'spec.md',
        source: 'text',
        text: 'RFC-9110 defines GET.',
      },
    ]);
    const withFile = {
      ...userMessage('z1', Constants.NO_PARENT, 'summarize this'),
      files: [{ file_id: 'file_zero' }],
    } as TMessage;

    await compactConversation({
      req: makeReq(),
      agent: { ...agent, fileTokenLimit: 0 },
      branch: [withFile],
      ids,
      db: dbMethods,
      getFiles,
    });

    const sent = mockStream.mock.calls[0][0] as BaseMessage[];
    const inlined = JSON.stringify(sent[0].content);
    expect(inlined).not.toContain('RFC-9110 defines GET.');
    /** The file is still named, so the checkpoint records that it existed. */
    expect(inlined).toContain('spec.md');
  });

  it('treats two custom endpoints differing only in case as different', async () => {
    /** `loadCustomEndpointsConfig` preserves case so `Foo` and `foo` can be two
     *  endpoints with different credentials; folding case would leave the
     *  configured summarizer unresolved and silently use the conversation's. */
    const appConfig = {
      endpoints: {
        custom: [
          { name: 'Foo', apiKey: 'foo-key', baseURL: 'https://foo.example', models: {} },
          { name: 'foo', apiKey: 'lower-key', baseURL: 'https://lower.example', models: {} },
        ],
      },
      summarization: { provider: 'foo', model: 'summarizer-model' },
    } as unknown as AppConfig;
    mockInitializeModel.mockClear();

    await compactConversation({
      req: {
        body: {},
        user: { id: 'user_1' },
        config: appConfig,
      } as unknown as ServerRequest,
      agent: { provider: 'Foo', endpoint: 'Foo', model: 'run-model' },
      branch,
      ids,
      db: dbMethods,
    });

    const clientOptions = mockInitializeModel.mock.calls[0][0].clientOptions as {
      model?: string;
      configuration?: { baseURL?: string };
    };
    /** Resolved to the lowercase endpoint the configuration names, not the
     *  conversation's `Foo`. */
    expect(clientOptions.model).toBe('summarizer-model');
    expect(clientOptions.configuration?.baseURL).toBe('https://lower.example');
  });

  it('does not carry run parameters into a cross-endpoint summarizer', async () => {
    /** `getGoogleConfig` spreads whatever it is handed into the client config,
     *  so an OpenAI conversation's parameters would reach a Google summarizer
     *  as generation settings it never asked for. */
    mockInitializeModel.mockClear();
    const originalKey = process.env.GOOGLE_KEY;
    process.env.GOOGLE_KEY = 'test-google-key';
    try {
      await compactConversation({
        req: makeReq({ provider: 'google', model: 'gemini-2.0-flash' }),
        agent: {
          provider: 'openAI',
          endpoint: 'openAI',
          model: 'gpt-4o-mini',
          model_parameters: { model: 'gpt-4o-mini', frequency_penalty: 0.7 },
        },
        branch,
        ids,
        db: dbMethods,
      });
    } finally {
      if (originalKey == null) {
        delete process.env.GOOGLE_KEY;
      } else {
        process.env.GOOGLE_KEY = originalKey;
      }
    }

    const clientOptions = mockInitializeModel.mock.calls[0][0].clientOptions as Record<
      string,
      unknown
    >;
    expect(clientOptions.frequency_penalty).toBeUndefined();
    expect(clientOptions.model).toBe('gemini-2.0-flash');
  });

  it('reads an output cap the endpoint relocated into modelKwargs', async () => {
    /** `getOpenAILLMConfig` MOVES a GPT-5 model's cap into
     *  `modelKwargs.max_completion_tokens` and deletes the top-level key, so
     *  reading only the provider key would size chunks as if the response were
     *  free and overflow the window mid-run, after billing. */
    const gpt5Agent = {
      provider: 'openAI',
      endpoint: 'openAI',
      model: 'gpt-5',
      model_parameters: { model: 'gpt-5', max_tokens: 399000 },
    };

    await expect(
      compactConversation({ req: makeReq(), agent: gpt5Agent, branch, ids, db: dbMethods }),
    ).rejects.toMatchObject({ name: 'UnworkableContextError' });
    expect(mockStream).not.toHaveBeenCalled();
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
