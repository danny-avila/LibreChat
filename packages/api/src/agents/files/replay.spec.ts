import sharp from 'sharp';
import { Readable } from 'stream';
import { randomBytes } from 'crypto';
import { agentsEndpointSchema, FileContext, FileSources } from 'librechat-data-provider';
import type { IMongoFile } from '@librechat/data-schemas';
import type { ServerRequest, StrategyFunctions } from '~/types';
import {
  selectHistoricalToolImages,
  replayHistoricalToolImages,
  appendHistoricalToolImageContext,
  canReplayHistoricalToolImages,
} from './replay';

const config = agentsEndpointSchema.parse({
  historicalToolImages: { enabled: true, models: ['vision'] },
}).historicalToolImages!;
const file = {
  file_id: 'image-1',
  context: FileContext.image_generation,
  type: 'image/png',
  bytes: 1024,
  filepath: '/private/image.png',
  filename: 'image.png',
  width: 900,
  height: 400,
} as IMongoFile;
const messages = [
  { messageId: 'u1', conversationId: 'conversation', isCreatedByUser: true },
  {
    messageId: 'a1',
    conversationId: 'conversation',
    isCreatedByUser: false,
    content: [{ type: 'tool_call', tool_call: { id: 'call-1', name: 'read_file_mcp_fixture' } }],
    attachments: [{ file_id: file.file_id, messageId: 'a1', toolCallId: 'call-1' }],
  },
  { messageId: 'u2', conversationId: 'conversation', isCreatedByUser: true },
];
const req = {
  body: {},
  config: { endpoints: { agents: { historicalToolImages: config } } },
} as ServerRequest;
const filesById = new Map([[file.file_id, file]]);
const selection = () => ({
  messages,
  filesById,
  config,
  model: 'vision',
  conversationId: 'conversation',
});
const countTokens = (parts: { type: string }[]) =>
  parts.filter((p) => p.type === 'image_url').length * 1000 + parts.length;

describe('historical MCP image admission', () => {
  it('checks shared handoff and summary recipients, leaving isolated subagents independent', () => {
    const resolve = jest.fn();
    const root = { model: 'vision', lazySubagentConfigs: [{ model: 'text-only', resolve }] };
    expect(canReplayHistoricalToolImages([root], config)).toBe(true);
    expect(canReplayHistoricalToolImages([root, { model: 'text-only' }], config)).toBe(false);
    expect(canReplayHistoricalToolImages([{}], config)).toBe(false);
    expect(
      canReplayHistoricalToolImages(
        [{ model: 'vision', model_parameters: { model: 'text-only' } }],
        config,
      ),
    ).toBe(false);
    expect(
      canReplayHistoricalToolImages([root], config, { enabled: true, model: 'text-only' }),
    ).toBe(false);
    expect(
      canReplayHistoricalToolImages(
        [{ ...root, summarization: { enabled: false, model: 'text-only' } }],
        config,
      ),
    ).toBe(true);
    expect(resolve).not.toHaveBeenCalled();
  });
  it('rejects client-submitted assistant provenance', () => {
    expect(
      selectHistoricalToolImages({
        ...selection(),
        messages: [messages[0], { ...messages[1], isUserSubmitted: true }, messages[2]],
      }),
    ).toEqual([]);
  });
  it('keeps the newest bounded images in producing order', () => {
    const refs = Array.from({ length: 4 }, (_, i) => ({
      file_id: `image-${i}`,
      messageId: 'a1',
      toolCallId: `call-${i}`,
    }));
    const history = [
      messages[0],
      {
        ...messages[1],
        attachments: refs,
        content: refs.map((ref) => ({
          type: 'tool_call',
          tool_call: { id: ref.toolCallId, name: 'read_file_mcp_fixture' },
        })),
      },
      messages[2],
    ];
    const canonical = new Map(refs.map((ref) => [ref.file_id, { ...file, file_id: ref.file_id }]));
    expect(
      selectHistoricalToolImages({ ...selection(), messages: history, filesById: canonical }).map(
        ({ file: selected }) => selected.file_id,
      ),
    ).toEqual(['image-1', 'image-2', 'image-3']);
  });
  it('selects a saved, authorized tool image without changing history or file records', () => {
    const before = JSON.stringify({ messages, file });
    expect(selectHistoricalToolImages(selection())).toEqual([
      { file, messageId: 'a1', toolCallId: 'call-1' },
    ]);
    expect(JSON.stringify({ messages, file })).toBe(before);
  });
  it.each([
    { config: undefined },
    { config: { ...config, enabled: false } },
    { model: 'text-only' },
    { filesById: new Map() },
    { conversationId: 'other' },
    { currentFileIds: new Set([file.file_id]) },
  ])(
    'does not admit opted-out, unsupported, unauthorized, other-branch or duplicate context: %j',
    (override) => {
      expect(selectHistoricalToolImages({ ...selection(), ...override })).toEqual([]);
    },
  );
  it.each([
    { context: FileContext.execute_code },
    { type: 'application/pdf' },
    { bytes: 0 },
    { bytes: config.maxSourceBytes + 1 },
    { llmDeliveryPath: 'none' },
    { conversationId: 'different' },
    { messageId: 'different' },
  ])('uses canonical policy fields rather than snapshots: %j', (override) => {
    expect(
      selectHistoricalToolImages({
        ...selection(),
        filesById: new Map([[file.file_id, { ...file, ...override }]]),
      }),
    ).toEqual([]);
  });
  it('requires a matching producing MCP call and message association', () => {
    for (const changed of [
      { ...messages[1], content: [] },
      {
        ...messages[1],
        content: [{ type: 'tool_call', tool_call: { id: 'call-1', name: 'execute_code' } }],
      },
      {
        ...messages[1],
        attachments: [{ file_id: file.file_id, messageId: 'forged', toolCallId: 'call-1' }],
      },
      {
        ...messages[1],
        content: [
          {
            type: 'tool_call',
            agentId: 'child',
            tool_call: { id: 'call-1', name: 'read_file_mcp_fixture' },
          },
        ],
      },
    ])
      expect(
        selectHistoricalToolImages({
          ...selection(),
          messages: [messages[0], changed, messages[2]],
        }),
      ).toEqual([]);
  });
  it('stops at the configured prior-turn boundary', () => {
    const history = [
      ...messages,
      { messageId: 'a2', conversationId: 'conversation', isCreatedByUser: false },
      { messageId: 'u3', isCreatedByUser: true },
    ];
    expect(selectHistoricalToolImages({ ...selection(), messages: history })).toEqual([]);
    expect(
      selectHistoricalToolImages({
        ...selection(),
        messages: history,
        config: { ...config, recentTurns: 2 },
      }),
    ).toHaveLength(1);
  });
});

describe('durable replay projection', () => {
  let image: Buffer;
  beforeAll(async () => {
    image = await sharp({
      create: { width: 2000, height: 800, channels: 3, background: '#ac1234' },
    })
      .png()
      .toBuffer();
  });
  function options(input = image) {
    const getDownloadStream = jest.fn(async () => Readable.from([input]));
    const getStrategyFunctions = () => ({ getDownloadStream }) as StrategyFunctions;
    return {
      req,
      messages,
      filesById,
      model: 'vision',
      conversationId: 'conversation',
      deps: { getStrategyFunctions, countTokens, admit: jest.fn() },
      getDownloadStream,
    };
  }
  it('reconstructs validated previews after serialization/reload and fits the configured edge', async () => {
    const opts = options();
    const result = await replayHistoricalToolImages({
      ...opts,
      messages: JSON.parse(JSON.stringify(messages)),
      filesById: new Map([[file.file_id, JSON.parse(JSON.stringify(file))]]),
    });
    expect(opts.getDownloadStream).toHaveBeenCalledTimes(1);
    expect(result.files[0].width).toBe(1024);
    expect(result.files[0].height).toBe(410);
    expect(result.content[1].type).toBe('image_url');
    expect(result.content[0]).toEqual(
      expect.objectContaining({ text: expect.stringContaining('"toolCallId":"call-1"') }),
    );
    expect(file.width).toBe(900);
  });
  it('omits corrupt images and leaves a bounded model-facing note', async () => {
    const result = await replayHistoricalToolImages(options(Buffer.from('invalid png')));
    expect(result.files).toEqual([]);
    expect(result.content).toEqual([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('unavailable') }),
    ]);
  });
  it('does not admit bytes whose decoded format differs from canonical MIME policy', async () => {
    const result = await replayHistoricalToolImages({
      ...options(),
      filesById: new Map([[file.file_id, { ...file, type: 'image/jpeg' }]]),
    });
    expect(result.files).toEqual([]);
  });
  it('fits a realistic noisy PNG into the byte cap without reducing the bounded edge', async () => {
    const source = await sharp(randomBytes(1400 * 800 * 3), {
      raw: { width: 1400, height: 800, channels: 3 },
    })
      .png()
      .toBuffer();
    const result = await replayHistoricalToolImages(options(source));
    expect(result.files).toHaveLength(1);
    expect(result.files[0].type).toBe('image/jpeg');
    expect(result.files[0].width).toBe(1024);
    expect(result.files[0].bytes).toBeLessThanOrEqual(config.maxPreviewBytes);
    expect(file.type).toBe('image/png');
    expect(result.content[1]).toEqual(
      expect.objectContaining({
        image_url: expect.objectContaining({
          url: expect.stringMatching(/^data:image\/jpeg;base64,/),
        }),
      }),
    );
  });
  it('bounds actual reads even if canonical byte metadata is stale', async () => {
    const result = await replayHistoricalToolImages({
      ...options(Buffer.alloc(2048)),
      req: {
        ...req,
        config: {
          endpoints: { agents: { historicalToolImages: { ...config, maxSourceBytes: 1024 } } },
        },
      } as ServerRequest,
    });
    expect(result.files).toEqual([]);
  });
  it('omits missing files without poisoning the next turn', async () => {
    const opts = options();
    opts.getDownloadStream.mockRejectedValueOnce(
      Object.assign(new Error('private path'), { code: 'ENOENT' }),
    );
    expect((await replayHistoricalToolImages(opts)).files).toEqual([]);
    expect((await replayHistoricalToolImages(opts)).files).toHaveLength(1);
  });
  it('propagates unexpected storage failures with safe error text', async () => {
    const opts = options();
    opts.getDownloadStream.mockRejectedValueOnce(new Error('secret storage credentials'));
    await expect(replayHistoricalToolImages(opts)).rejects.toThrow(
      'An attached file could not be read from storage',
    );
  });
  it('respects endpoint MIME policy and performs no storage read for rejected files', async () => {
    const opts = options();
    const filteredReq: ServerRequest = Object.assign({}, req);
    filteredReq.config = {
      ...req.config,
      config: {},
      fileStrategy: FileSources.local,
      imageOutputType: 'png',
      fileConfig: { endpoints: { custom: { supportedMimeTypes: ['application/pdf'] } } },
    };
    const result = await replayHistoricalToolImages({
      ...opts,
      endpoint: 'custom',
      req: filteredReq,
    });
    expect(result.files).toEqual([]);
    expect(opts.getDownloadStream).not.toHaveBeenCalled();
  });
  it('caps image tokens and decoded pixels', async () => {
    for (const limit of [{ maxTokens: 500 }, { maxSourcePixels: 100 }]) {
      const result = await replayHistoricalToolImages({
        ...options(),
        req: {
          ...req,
          config: { endpoints: { agents: { historicalToolImages: { ...config, ...limit } } } },
        } as ServerRequest,
      });
      expect(result.files).toEqual([]);
    }
  });
  it('changes only prompt content and prompt token accounting', async () => {
    const payload = [{ role: 'user', content: 'What was written on the previous image?' }];
    const indexTokenCountMap = { 0: 1 };
    const before = JSON.stringify(messages);
    const added = await appendHistoricalToolImageContext({
      ...options(),
      payload,
      indexTokenCountMap,
    });
    expect(added).toBeGreaterThan(1000);
    expect(indexTokenCountMap[0]).toBe(1 + added);
    expect(payload[0].content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'image_url' })]),
    );
    expect(JSON.stringify(messages)).toBe(before);
  });
  it('honors resendFiles=false and does no storage work by default', async () => {
    const opts = options();
    const payload = [{ role: 'user', content: 'Follow-up' }];
    expect(
      await appendHistoricalToolImageContext({
        ...opts,
        payload,
        indexTokenCountMap: {},
        resendFiles: false,
      }),
    ).toBe(0);
    expect(opts.getDownloadStream).not.toHaveBeenCalled();
    expect(
      (await replayHistoricalToolImages({ ...opts, req: { ...req, config: {} } as ServerRequest }))
        .content,
    ).toEqual([]);
  });
  it('rejects mixed handoff recipients before any storage read or prompt mutation', async () => {
    const opts = options();
    const payload = [{ role: 'user', content: 'Follow-up' }];
    expect(
      await appendHistoricalToolImageContext({
        ...opts,
        payload,
        indexTokenCountMap: {},
        recipients: [{ model: 'vision' }, { model: 'text-only' }],
      }),
    ).toBe(0);
    expect(opts.getDownloadStream).not.toHaveBeenCalled();
    expect(payload[0].content).toBe('Follow-up');
  });
});
