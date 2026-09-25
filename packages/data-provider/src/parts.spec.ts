import type { MappableContentPart, UIMessagePart, UIToolPart } from './parts';
import type { TMessageContentParts } from './types/content';
import type { TAttachment, TMessage } from './schemas';
import {
  fromUIMessage,
  isUIToolPart,
  isUIDataPart,
  toUIMessage,
  fromUIParts,
  fromUIPart,
  toUIParts,
  toUIPart,
} from './parts';
import { ContentTypes } from './types/runs';
import { Tools } from './types/tools';

/** One representative part per content type; the `Record` makes a missing member a type error. */
const samples: Record<ContentTypes, MappableContentPart> = {
  [ContentTypes.TEXT]: {
    type: ContentTypes.TEXT,
    text: 'Hello',
    tool_call_ids: ['call-1'],
    phase: 'final_answer',
    agentId: 'agent-a',
    groupId: 1,
  },
  [ContentTypes.THINK]: {
    type: ContentTypes.THINK,
    think: 'Considering',
    reasoning_label: 'Planning',
    reasoning_label_status: 'complete',
  },
  [ContentTypes.TEXT_DELTA]: { type: ContentTypes.TEXT_DELTA, text_delta: 'chunk' },
  [ContentTypes.TOOL_CALL]: {
    type: ContentTypes.TOOL_CALL,
    tool_call: {
      id: 'call-1',
      name: 'search',
      args: '{"q":"cats"}',
      output: '3',
      progress: 1,
      type: 'tool_call',
    },
  },
  [ContentTypes.IMAGE_FILE]: {
    type: ContentTypes.IMAGE_FILE,
    image_file: {
      file_id: 'file-1',
      filename: 'cat.png',
      filepath: '/images/cat.png',
      height: 10,
      width: 20,
      type: 'image/png',
      user: 'user-1',
      bytes: 42,
      embedded: false,
      object: 'file',
      usage: 0,
    },
  },
  [ContentTypes.IMAGE_URL]: {
    type: ContentTypes.IMAGE_URL,
    image_url: { url: 'https://x/cat.png', detail: 'high' },
  },
  [ContentTypes.VIDEO_URL]: { type: ContentTypes.VIDEO_URL, video_url: { url: 'https://x/v.mp4' } },
  [ContentTypes.INPUT_AUDIO]: {
    type: ContentTypes.INPUT_AUDIO,
    input_audio: { data: 'AAAA', format: 'wav' },
  },
  [ContentTypes.AGENT_UPDATE]: {
    type: ContentTypes.AGENT_UPDATE,
    agent_update: { index: 1, runId: 'run-1', agentId: 'agent-b' },
    agentId: 'agent-b',
    groupId: 1,
  },
  [ContentTypes.SUMMARY]: {
    type: ContentTypes.SUMMARY,
    content: [{ type: ContentTypes.TEXT, text: 'Earlier, we talked.' }],
    summarizing: false,
  },
  [ContentTypes.ACTIVITY_LABEL]: {
    type: ContentTypes.ACTIVITY_LABEL,
    activity_label: 'Searched the web',
    tool_call_ids: ['call-1'],
    status: 'ok',
  },
  [ContentTypes.STEER]: { type: ContentTypes.STEER, steer: 'Focus on cats', steerId: 's-1' },
  [ContentTypes.ERROR]: { type: ContentTypes.ERROR, error: 'Rate limited' },
};

const expectedUITypes: Record<ContentTypes, string> = {
  [ContentTypes.TEXT]: 'text',
  [ContentTypes.THINK]: 'reasoning',
  [ContentTypes.TEXT_DELTA]: 'text',
  [ContentTypes.TOOL_CALL]: 'tool-search',
  [ContentTypes.IMAGE_FILE]: 'file',
  [ContentTypes.IMAGE_URL]: 'file',
  [ContentTypes.VIDEO_URL]: 'file',
  [ContentTypes.INPUT_AUDIO]: 'file',
  [ContentTypes.AGENT_UPDATE]: 'data-agent-update',
  [ContentTypes.SUMMARY]: 'data-summary',
  [ContentTypes.ACTIVITY_LABEL]: 'data-activity-label',
  [ContentTypes.STEER]: 'data-steer',
  [ContentTypes.ERROR]: 'data-error',
};

const lossless = Object.values(ContentTypes).filter((type) => type !== ContentTypes.TEXT_DELTA);

/** A content array of `length` slots with only `slots` written, as the reducers leave it. */
const sparse = (length: number, slots: Record<number, TMessageContentParts>) => {
  const content: TMessageContentParts[] = new Array(length);
  for (const [index, part] of Object.entries(slots)) {
    content[Number(index)] = part;
  }
  return content;
};

/**
 * Content arrays recorded from the stream reducers in
 * `client/src/hooks/SSE/__tests__/steps.spec.ts` (text, tool calls, reasoning, handoff, summary,
 * image scenarios), captured by running those reducers. Holes are where a later step arrived
 * before an earlier one.
 */
const recorded: Record<string, TMessageContentParts[]> = {
  toolCompleted: [
    { type: ContentTypes.TEXT, text: 'Hi' },
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: 'call-1',
        name: 'search',
        args: '{"q":"cats"}',
        stepId: 'step-tool',
        type: 'tool_call',
        progress: 1,
        output: '3',
      },
    },
  ],
  toolStreaming: [
    { type: ContentTypes.TEXT, text: 'Hi' },
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: 'call-1',
        name: 'search',
        args: '{"q":',
        stepId: 'step-tool',
        type: 'tool_call',
      },
    },
  ],
  toolCancelled: [
    { type: ContentTypes.TEXT, text: 'Hi' },
    {
      type: ContentTypes.TOOL_CALL,
      tool_call: {
        id: 'call-1',
        name: 'search',
        args: '{"q":"cats"}',
        stepId: 'step-tool',
        type: 'tool_call',
        runStepStatus: 'cancelled',
        runStepDurationMs: 250,
      },
    },
  ],
  outOfOrder: sparse(3, {
    0: { type: ContentTypes.TEXT, text: 'first' },
    2: { type: ContentTypes.TEXT, text: 'second' },
  }),
  reasoning: [
    {
      type: ContentTypes.THINK,
      think: 'Let me think',
      agentId: 'agent-a',
      groupId: 2,
      reasoning_label_step_id: 'step-think',
    },
    { type: ContentTypes.TEXT, text: 'Answer', agentId: 'agent-a', groupId: 2 },
  ],
  agentUpdate: [
    { type: ContentTypes.TEXT, text: 'Hi' },
    {
      type: ContentTypes.AGENT_UPDATE,
      agent_update: { index: 1, runId: 'response-1', agentId: 'agent-b' },
      agentId: 'agent-b',
      groupId: 1,
    },
  ],
  summaryFailed: [
    { type: ContentTypes.TEXT, text: 'Hi' },
    {
      type: ContentTypes.SUMMARY,
      content: [
        { type: ContentTypes.TEXT, text: 'Earlier, ' },
        { type: ContentTypes.TEXT, text: 'we talked.' },
      ],
      summarizing: false,
      failed: true,
    },
    { type: ContentTypes.TEXT, text: 'after' },
  ],
  imageUrl: [{ type: ContentTypes.IMAGE_URL, image_url: 'https://x/first.png' }],
};

const toolPartAt = (content: TMessageContentParts[], index: number) =>
  toUIParts(content)[index] as UIToolPart;

/** Deterministic PRNG so a failing generated case reproduces. */
const createRandom = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
};

const createMessage = (overrides: Partial<TMessage>): TMessage => ({
  messageId: 'response-1',
  conversationId: 'convo-1',
  parentMessageId: 'user-1',
  isCreatedByUser: false,
  text: '',
  ...overrides,
});

describe('parts', () => {
  describe('toUIPart', () => {
    it.each(Object.values(ContentTypes))('maps %s to its UI part', (type) => {
      expect(toUIPart(samples[type]).type).toBe(expectedUITypes[type]);
    });

    it.each(lossless)('round-trips %s', (type) => {
      expect(fromUIPart(toUIPart(samples[type]))).toStrictEqual(samples[type]);
    });

    it('maps a streamed text delta to a streaming text part', () => {
      expect(toUIPart(samples[ContentTypes.TEXT_DELTA])).toEqual({
        type: 'text',
        text: 'chunk',
        state: 'streaming',
      });
    });

    it('keeps the object form of text and its annotations', () => {
      const part: TMessageContentParts = {
        type: ContentTypes.TEXT,
        text: {
          value: 'See file',
          annotations: [
            {
              type: 'file_path',
              text: 'file',
              start_index: 4,
              end_index: 8,
              file_path: { file_id: 'f' },
            },
          ],
        },
      };
      const uiPart = toUIPart(part);

      expect(uiPart).toMatchObject({ type: 'text', text: 'See file' });
      expect(fromUIPart(uiPart)).toStrictEqual(part);
    });

    it('maps a missing slot to step-start and step-start back to nothing', () => {
      expect(toUIPart(undefined)).toEqual({ type: 'step-start' });
      expect(fromUIPart({ type: 'step-start' })).toBeUndefined();
    });

    it('exposes the AI SDK fields of a file part', () => {
      expect(toUIPart(samples[ContentTypes.IMAGE_FILE])).toMatchObject({
        type: 'file',
        mediaType: 'image/png',
        filename: 'cat.png',
        url: '/images/cat.png',
      });
      expect(toUIPart(samples[ContentTypes.INPUT_AUDIO])).toMatchObject({
        mediaType: 'audio/wav',
        url: 'data:audio/wav;base64,AAAA',
      });
    });

    it('builds an agents tool call from a hand-made tool part', () => {
      const part: UIToolPart = {
        type: 'tool-search',
        toolCallId: 'call-9',
        state: 'output-available',
        input: { q: 'dogs' },
        output: '5',
      };

      expect(fromUIPart(part)).toEqual({
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          type: 'tool_call',
          name: 'search',
          id: 'call-9',
          args: '{"q":"dogs"}',
          output: '5',
        },
      });
    });

    it('names legacy assistants tool calls by their kind', () => {
      const code = toUIPart({
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          id: 'ci-1',
          type: 'code_interpreter',
          code_interpreter: { input: 'print(1)', outputs: [{ logs: '1' }] },
        },
      });
      const fn = toUIPart({
        type: ContentTypes.TOOL_CALL,
        tool_call: {
          id: 'fn-1',
          type: 'function',
          function: { name: 'lookup', arguments: '{"id":1}', output: null },
        },
      });

      expect(code).toMatchObject({
        type: 'tool-code_interpreter',
        toolCallId: 'ci-1',
        state: 'output-available',
        input: 'print(1)',
        output: [{ logs: '1' }],
      });
      expect(fn).toMatchObject({
        type: 'tool-lookup',
        toolCallId: 'fn-1',
        state: 'input-available',
        input: { id: 1 },
      });
    });
  });

  describe('tool states from recorded streams', () => {
    it('reports a completed call as output-available with parsed input', () => {
      expect(toolPartAt(recorded.toolCompleted, 1)).toMatchObject({
        type: 'tool-search',
        toolCallId: 'call-1',
        state: 'output-available',
        input: { q: 'cats' },
        output: '3',
      });
    });

    it('reports partial arguments as input-streaming', () => {
      expect(toolPartAt(recorded.toolStreaming, 1)).toMatchObject({
        state: 'input-streaming',
        input: '{"q":',
      });
    });

    it('reports a cancelled step as output-error', () => {
      expect(toolPartAt(recorded.toolCancelled, 1)).toMatchObject({
        state: 'output-error',
        errorText: 'cancelled',
        input: { q: 'cats' },
      });
    });
  });

  describe('recorded reducer output', () => {
    it.each(Object.entries(recorded))('%s keeps positions and round-trips', (_name, content) => {
      const parts = toUIParts(content);

      expect(parts).toHaveLength(content.length);
      for (let i = 0; i < content.length; i++) {
        const part = content[i] as MappableContentPart | undefined;
        expect(parts[i].type).toBe(part ? expectedUITypes[part.type] : 'step-start');
      }
      expect(fromUIParts(parts)).toStrictEqual(content);
    });
  });

  describe('generated content', () => {
    const pool = lossless.map((type) => samples[type]);

    it('preserves order, holes and every part over random content arrays', () => {
      const random = createRandom(7);
      for (let run = 0; run < 250; run++) {
        const length = Math.floor(random() * 12);
        const content: TMessageContentParts[] = new Array(length);
        for (let i = 0; i < length; i++) {
          if (random() < 0.2) {
            continue;
          }
          content[i] = pool[Math.floor(random() * pool.length)] as TMessageContentParts;
        }

        const parts = toUIParts(content);
        expect(parts).toHaveLength(length);
        for (let i = 0; i < length; i++) {
          const part = content[i] as MappableContentPart | undefined;
          expect(parts[i].type).toBe(part ? expectedUITypes[part.type] : 'step-start');
        }
        expect(fromUIParts(parts)).toStrictEqual(content);
      }
    });
  });

  describe('toUIMessage', () => {
    it('views a response with content, metadata, files and sources', () => {
      const attachment = {
        conversationId: 'convo-1',
        messageId: 'response-1',
        toolCallId: 'call-1',
        type: Tools.web_search,
        [Tools.web_search]: {
          organic: [{ link: 'https://a.example', title: 'A' }],
          topStories: [{ link: 'https://b.example' }],
        },
      } as TAttachment;
      const content: TMessageContentParts[] = [
        samples[ContentTypes.STEER] as TMessageContentParts,
        ...recorded.reasoning,
        samples[ContentTypes.AGENT_UPDATE] as TMessageContentParts,
        samples[ContentTypes.ACTIVITY_LABEL] as TMessageContentParts,
        samples[ContentTypes.SUMMARY] as TMessageContentParts,
      ];
      const message = createMessage({
        content,
        sender: 'Agent',
        model: 'agent-a',
        unfinished: true,
        files: [{ filepath: '/files/report.pdf', filename: 'report.pdf', type: 'application/pdf' }],
        attachments: [attachment],
      });

      const view = toUIMessage(message);

      expect(view.id).toBe('response-1');
      expect(view.role).toBe('assistant');
      expect(view.parts.map((part) => part.type)).toEqual([
        'data-steer',
        'reasoning',
        'text',
        'data-agent-update',
        'data-activity-label',
        'data-summary',
        'file',
        'source-url',
        'source-url',
      ]);
      expect(view.parts.slice(-3)).toEqual([
        {
          type: 'file',
          mediaType: 'application/pdf',
          filename: 'report.pdf',
          url: '/files/report.pdf',
        },
        { type: 'source-url', sourceId: 'call-1-0', url: 'https://a.example', title: 'A' },
        { type: 'source-url', sourceId: 'call-1-1', url: 'https://b.example' },
      ]);
      expect(view.metadata).toEqual({
        conversationId: 'convo-1',
        parentMessageId: 'user-1',
        sender: 'Agent',
        model: 'agent-a',
        unfinished: true,
        agentIds: ['agent-a', 'agent-b'],
        groupIds: [2, 1],
        steers: [{ steer: 'Focus on cats', steerId: 's-1' }],
        activityLabels: [
          { activity_label: 'Searched the web', tool_call_ids: ['call-1'], status: 'ok' },
        ],
        summaries: [
          {
            content: [{ type: ContentTypes.TEXT, text: 'Earlier, we talked.' }],
            summarizing: false,
          },
        ],
      });
      expect(fromUIMessage(view, message)).toStrictEqual(message);
    });

    it('views a contentless user message as its text and files', () => {
      const message = createMessage({
        messageId: 'user-1',
        parentMessageId: null,
        isCreatedByUser: true,
        text: 'Describe this',
        files: [{ filepath: '/images/cat.png', filename: 'cat.png', type: 'image/png' }],
      });

      const view = toUIMessage(message);

      expect(view).toEqual({
        id: 'user-1',
        role: 'user',
        metadata: { conversationId: 'convo-1', parentMessageId: null, contentless: true },
        parts: [
          { type: 'text', text: 'Describe this' },
          { type: 'file', mediaType: 'image/png', filename: 'cat.png', url: '/images/cat.png' },
        ],
      });
      expect(fromUIMessage(view)).toEqual(message);
    });

    it('writes edited parts back onto the stored message', () => {
      const message = createMessage({ content: recorded.toolCompleted, text: 'Hi' });
      const view = toUIMessage(message);
      const parts: UIMessagePart[] = [{ type: 'text', text: 'Hello' }, ...view.parts.slice(1)];

      const next = fromUIMessage({ ...view, parts }, message);

      expect(next.content?.[0]).toEqual({ type: ContentTypes.TEXT, text: 'Hello' });
      expect(next.content?.[1]).toStrictEqual(recorded.toolCompleted[1]);
      expect(next.parentMessageId).toBe('user-1');
    });
  });

  it('narrows tool and data parts', () => {
    const parts = toUIParts(recorded.agentUpdate.concat(recorded.toolCompleted[1]));

    expect(parts.filter(isUIDataPart).map((part) => part.type)).toEqual(['data-agent-update']);
    expect(parts.filter(isUIToolPart).map((part) => part.toolCallId)).toEqual(['call-1']);
  });
});
