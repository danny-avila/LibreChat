import type { IMongoFile } from '@librechat/data-schemas';
import type { SteerMediaClient, SteerFileFetcher } from '../media';
import { buildSteerMedia, stampSteerPartMedia } from '../media';

jest.spyOn(console, 'log').mockImplementation();

/** Stand-in for AgentClient: the encode fan-out is stubbed at the same seam
 *  BaseClient exposes (processAttachments populates media fields in place). */
function createClient({
  image_urls,
  documents,
  fileContext,
}: {
  image_urls?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  fileContext?: string;
} = {}): SteerMediaClient & { processAttachments: jest.Mock } {
  return {
    addFileContextToMessage: jest.fn(async (pseudo: Record<string, unknown>) => {
      if (fileContext) {
        pseudo.fileContext = fileContext;
      }
    }),
    processAttachments: jest.fn(async (pseudo: Record<string, unknown>, files: IMongoFile[]) => {
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

const user = { id: 'user-1' };
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
} as unknown as IMongoFile;
const secondDoc = {
  file_id: 'f2',
  type: 'image/png',
  filepath: '/uploads/u1/f2.png',
  bytes: 99,
} as unknown as IMongoFile;

const steerItem = (files: Array<{ file_id: string }>, text = 'look at this') => ({
  steerId: 's1',
  text,
  userId: 'user-1',
  createdAt: Date.now(),
  files,
});

describe('buildSteerMedia', () => {
  it('fetches owner-scoped files and assembles text + media content', async () => {
    const getFiles: SteerFileFetcher = jest.fn(async () => [imageDoc]);
    const client = createClient({ image_urls: [imagePart] });

    const result = await buildSteerMedia({
      client,
      user,
      item: steerItem([{ file_id: 'f1' }]),
      getFiles,
    });

    expect(getFiles).toHaveBeenCalledWith({ file_id: { $in: ['f1'] }, user: 'user-1' }, {}, {});
    expect(result?.content).toEqual([{ type: 'text', text: 'look at this' }, imagePart]);
    expect(result?.files).toEqual([
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

  it('restores the composer ref order over the $in result', async () => {
    // DB returns f1 before f2; the user attached f2 first.
    const getFiles: SteerFileFetcher = jest.fn(async () => [imageDoc, secondDoc]);
    const client = createClient({ image_urls: [imagePart] });

    const result = await buildSteerMedia({
      client,
      user,
      item: steerItem([{ file_id: 'f2' }, { file_id: 'f1' }]),
      getFiles,
    });

    expect(client.processAttachments).toHaveBeenCalledWith(expect.anything(), [
      secondDoc,
      imageDoc,
    ]);
    expect(result?.files?.map((file) => file.file_id)).toEqual(['f2', 'f1']);
  });

  it('prepends extracted file context to the steer text', async () => {
    const getFiles: SteerFileFetcher = jest.fn(async () => [
      { file_id: 'f2', type: 'text/plain' } as unknown as IMongoFile,
    ]);
    const client = createClient({ fileContext: 'Attached document(s): notes' });

    const result = await buildSteerMedia({
      client,
      user,
      item: steerItem([{ file_id: 'f2' }], 'summarize it'),
      getFiles,
    });

    expect(result?.content).toEqual([
      { type: 'text', text: 'Attached document(s): notes\nsummarize it' },
    ]);
  });

  it('returns undefined when no authorized files remain', async () => {
    const getFiles: SteerFileFetcher = jest.fn(async () => []);
    const client = createClient({ image_urls: [imagePart] });

    const result = await buildSteerMedia({
      client,
      user,
      item: steerItem([{ file_id: 'not-yours' }]),
      getFiles,
    });

    expect(result).toBeUndefined();
    expect(client.processAttachments).not.toHaveBeenCalled();
  });

  it('scopes the fetch to the tenant when present', async () => {
    const getFiles: SteerFileFetcher = jest.fn(async () => []);
    await buildSteerMedia({
      client: createClient(),
      user: { id: 'user-1', tenantId: 'ten-1' },
      item: steerItem([{ file_id: 'f1' }], 'x'),
      getFiles,
    });
    expect(getFiles).toHaveBeenCalledWith(
      { file_id: { $in: ['f1'] }, user: 'user-1', tenantId: 'ten-1' },
      {},
      {},
    );
  });
});

describe('stampSteerPartMedia', () => {
  it('stamps media onto steer parts immutably with one batched fetch', async () => {
    const getFiles: SteerFileFetcher = jest.fn(async () => [imageDoc]);
    const client = createClient({ image_urls: [imagePart] });
    const steerPart = {
      type: 'steer',
      steer: 'inline steer',
      steerId: 's1',
      files: [{ file_id: 'f1' }],
    };
    const otherPart = { type: 'text', text: 'assistant text' };
    const originalContent = [otherPart, steerPart];
    const message: { role: string; content: unknown } = {
      role: 'assistant',
      content: originalContent,
    };
    const payload = [{ role: 'user', content: 'hi' }, message];

    const stamped = await stampSteerPartMedia({ client, user, payload, getFiles });

    expect(getFiles).toHaveBeenCalledTimes(1);
    const content = message.content as Array<Record<string, unknown>>;
    expect(content).not.toBe(originalContent);
    expect(content[0]).toBe(otherPart);
    expect(content[1]).not.toBe(steerPart);
    expect(content[1].media).toEqual([{ type: 'text', text: 'inline steer' }, imagePart]);
    expect(steerPart).not.toHaveProperty('media');
    expect(stamped).toEqual([
      {
        index: 1,
        media: [{ type: 'text', text: 'inline steer' }, imagePart],
        steerText: 'inline steer',
      },
    ]);
  });

  it('consumes prefetched docs without issuing a second query', async () => {
    const getFiles: SteerFileFetcher = jest.fn(async () => []);
    const client = createClient({ image_urls: [imagePart] });
    const steerPart = {
      type: 'steer',
      steer: 'prefetched steer',
      steerId: 's2',
      files: [{ file_id: 'f1' }, { file_id: 'unauthorized' }],
    };
    const message = { role: 'assistant', content: [steerPart] };

    const stamped = await stampSteerPartMedia({
      client,
      user,
      payload: [message],
      docsById: new Map([['f1', imageDoc]]),
      getFiles,
    });

    expect(getFiles).not.toHaveBeenCalled();
    expect(stamped).toHaveLength(1);
    expect(stamped[0].index).toBe(0);
    expect(client.processAttachments).toHaveBeenCalledWith(expect.anything(), [imageDoc]);
  });

  it('does nothing when no steer part carries files', async () => {
    const getFiles: SteerFileFetcher = jest.fn(async () => []);
    const payload = [{ role: 'assistant', content: [{ type: 'steer', steer: 'text only' }] }];
    await stampSteerPartMedia({ client: createClient(), user, payload, getFiles });
    expect(getFiles).not.toHaveBeenCalled();
  });

  it('leaves the part text-only when its files are no longer authorized', async () => {
    const getFiles: SteerFileFetcher = jest.fn(async () => []);
    const steerPart = {
      type: 'steer',
      steer: 'orphaned',
      steerId: 's9',
      files: [{ file_id: 'gone' }],
    };
    const message = { role: 'assistant', content: [steerPart] };

    await stampSteerPartMedia({ client: createClient(), user, payload: [message], getFiles });

    expect((message.content as unknown[])[0]).toBe(steerPart);
    expect(steerPart).not.toHaveProperty('media');
  });
});
