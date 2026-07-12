const { ContentTypes } = require('librechat-data-provider');

jest.mock('~/models', () => ({
  getFiles: jest.fn(),
}));

const { getFiles } = require('~/models');
const { buildSteerMedia, stampSteerPartMedia } = require('../steering');

/** Stand-in for AgentClient: the encode fan-out is stubbed at the same seam
 *  BaseClient exposes (processAttachments populates media fields in place). */
function createClient({ image_urls, documents, fileContext } = {}) {
  return {
    addFileContextToMessage: jest.fn(async (pseudo) => {
      if (fileContext) {
        pseudo.fileContext = fileContext;
      }
    }),
    processAttachments: jest.fn(async (pseudo, files) => {
      if (image_urls) {
        pseudo.image_urls = image_urls;
      }
      if (documents) {
        pseudo.documents = documents;
      }
      return files;
    }),
  };
}

const req = { user: { id: 'user-1' } };
const imagePart = {
  type: 'image_url',
  image_url: { url: 'data:image/png;base64,abc', detail: 'auto' },
};
const imageDoc = {
  file_id: 'f1',
  type: 'image/png',
  filepath: '/uploads/u1/f1.png',
  filename: 'shot.png',
  height: 10,
  width: 20,
  bytes: 1234,
  user: 'user-1',
};

describe('buildSteerMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches owner-scoped files and assembles text + media content', async () => {
    getFiles.mockResolvedValue([imageDoc]);
    const client = createClient({ image_urls: [imagePart] });

    const result = await buildSteerMedia({
      client,
      req,
      item: { steerId: 's1', text: 'look at this', files: [{ file_id: 'f1' }] },
    });

    expect(getFiles).toHaveBeenCalledWith({ file_id: { $in: ['f1'] }, user: 'user-1' }, {}, {});
    expect(result.content).toEqual([{ type: 'text', text: 'look at this' }, imagePart]);
    expect(result.files).toEqual([
      {
        file_id: 'f1',
        type: 'image/png',
        filepath: '/uploads/u1/f1.png',
        filename: 'shot.png',
        height: 10,
        width: 20,
        bytes: 1234,
      },
    ]);
  });

  it('prepends extracted file context to the steer text', async () => {
    getFiles.mockResolvedValue([{ file_id: 'f2', type: 'text/plain' }]);
    const client = createClient({ fileContext: 'Attached document(s): notes' });

    const result = await buildSteerMedia({
      client,
      req,
      item: { steerId: 's2', text: 'summarize it', files: [{ file_id: 'f2' }] },
    });

    expect(result.content).toEqual([
      { type: 'text', text: 'Attached document(s): notes\nsummarize it' },
    ]);
  });

  it('returns undefined when no authorized files remain', async () => {
    getFiles.mockResolvedValue([]);
    const client = createClient({ image_urls: [imagePart] });

    const result = await buildSteerMedia({
      client,
      req,
      item: { steerId: 's3', text: 'text', files: [{ file_id: 'not-yours' }] },
    });

    expect(result).toBeUndefined();
    expect(client.processAttachments).not.toHaveBeenCalled();
  });

  it('scopes the fetch to the tenant when present', async () => {
    getFiles.mockResolvedValue([]);
    await buildSteerMedia({
      client: createClient(),
      req: { user: { id: 'user-1', tenantId: 'ten-1' } },
      item: { steerId: 's4', text: 'x', files: [{ file_id: 'f1' }] },
    });
    expect(getFiles).toHaveBeenCalledWith(
      { file_id: { $in: ['f1'] }, user: 'user-1', tenantId: 'ten-1' },
      {},
      {},
    );
  });
});

describe('stampSteerPartMedia', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stamps media onto steer parts immutably with one batched fetch', async () => {
    getFiles.mockResolvedValue([imageDoc]);
    const client = createClient({ image_urls: [imagePart] });
    const steerPart = {
      type: ContentTypes.STEER,
      [ContentTypes.STEER]: 'inline steer',
      steerId: 's1',
      files: [{ file_id: 'f1' }],
    };
    const otherPart = { type: ContentTypes.TEXT, text: 'assistant text' };
    const originalContent = [otherPart, steerPart];
    const message = { role: 'assistant', content: originalContent };
    const payload = [{ role: 'user', content: 'hi' }, message];

    const stamped = await stampSteerPartMedia({ client, req, payload });

    expect(getFiles).toHaveBeenCalledTimes(1);
    expect(message.content).not.toBe(originalContent);
    expect(message.content[0]).toBe(otherPart);
    expect(message.content[1]).not.toBe(steerPart);
    expect(message.content[1].media).toEqual([{ type: 'text', text: 'inline steer' }, imagePart]);
    expect(steerPart.media).toBeUndefined();
    expect(stamped).toEqual([
      { index: 1, media: [{ type: 'text', text: 'inline steer' }, imagePart] },
    ]);
  });

  it('consumes prefetched docs without issuing a second query', async () => {
    const client = createClient({ image_urls: [imagePart] });
    const steerPart = {
      type: ContentTypes.STEER,
      [ContentTypes.STEER]: 'prefetched steer',
      steerId: 's2',
      files: [{ file_id: 'f1' }, { file_id: 'unauthorized' }],
    };
    const message = { role: 'assistant', content: [steerPart] };

    const stamped = await stampSteerPartMedia({
      client,
      req,
      payload: [message],
      docsById: new Map([['f1', imageDoc]]),
    });

    expect(getFiles).not.toHaveBeenCalled();
    expect(stamped).toHaveLength(1);
    expect(stamped[0].index).toBe(0);
    expect(client.processAttachments).toHaveBeenCalledWith(expect.anything(), [imageDoc]);
  });

  it('does nothing when no steer part carries files', async () => {
    const payload = [
      {
        role: 'assistant',
        content: [{ type: ContentTypes.STEER, [ContentTypes.STEER]: 'text only' }],
      },
    ];
    await stampSteerPartMedia({ client: createClient(), req, payload });
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('leaves the part text-only when its files are no longer authorized', async () => {
    getFiles.mockResolvedValue([]);
    const steerPart = {
      type: ContentTypes.STEER,
      [ContentTypes.STEER]: 'orphaned',
      steerId: 's9',
      files: [{ file_id: 'gone' }],
    };
    const message = { role: 'assistant', content: [steerPart] };

    await stampSteerPartMedia({ client: createClient(), req, payload: [message] });

    expect(message.content[0]).toBe(steerPart);
    expect(steerPart.media).toBeUndefined();
  });
});
