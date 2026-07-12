/**
 * `meiliEnabled` is a module-level constant evaluated when `mongoMeili` is first
 * imported, so the MeiliSearch env vars must be set before the plugin module is
 * loaded. The plugin is therefore imported lazily inside `beforeAll`, after the
 * env is set, and the prior values are restored in `afterAll` so this suite does
 * not leak `meiliEnabled: true` into other test files that share the Jest
 * worker's `process.env`.
 *
 * This suite covers the `saveConvo` code path, which calls `findOneAndUpdate`
 * with `includeResultMetadata: true`. Mongoose then resolves the query to the raw
 * `{ value, ok, lastErrorObject }` wrapper, and the post hook must unwrap `value`
 * before invoking the indexing hook (regression test for conversation titles not
 * syncing to MeiliSearch).
 */
import mongoose from 'mongoose';
import { EModelEndpoint } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { SchemaWithMeiliMethods } from '~/models/plugins/mongoMeili';

const MEILI_ENV_KEYS = ['SEARCH', 'MEILI_HOST', 'MEILI_MASTER_KEY'] as const;
const savedMeiliEnv: Partial<Record<(typeof MEILI_ENV_KEYS)[number], string | undefined>> = {};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const waitForMock = async (mock: jest.Mock, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (mock.mock.calls.length === 0) {
    if (Date.now() - start > timeoutMs) {
      return;
    }
    await wait(10);
  }
};

const mockAddDocuments = jest.fn();
const mockUpdateDocuments = jest.fn();
const mockDeleteDocument = jest.fn();
const mockGetDocument = jest.fn();
const mockIndex = jest.fn().mockReturnValue({
  getRawInfo: jest.fn(),
  updateSettings: jest.fn(),
  addDocuments: mockAddDocuments,
  addDocumentsInBatches: jest.fn(),
  updateDocuments: mockUpdateDocuments,
  deleteDocument: mockDeleteDocument,
  deleteDocuments: jest.fn(),
  getDocument: mockGetDocument,
  getDocuments: jest.fn().mockReturnValue({ results: [] }),
});
jest.mock('meilisearch', () => ({
  MeiliSearch: jest.fn().mockImplementation(() => ({ index: mockIndex })),
}));

describe('mongoMeili findOneAndUpdate with includeResultMetadata (saveConvo path)', () => {
  let mongoServer: MongoMemoryServer;
  let createConversationModel: (typeof import('~/models/convo'))['createConversationModel'];
  let conversationModel: SchemaWithMeiliMethods;

  beforeAll(async () => {
    for (const key of MEILI_ENV_KEYS) {
      savedMeiliEnv[key] = process.env[key];
    }
    process.env.SEARCH = 'true';
    process.env.MEILI_HOST = 'foo';
    process.env.MEILI_MASTER_KEY = 'bar';

    ({ createConversationModel } = await import('~/models/convo'));
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    conversationModel = createConversationModel(mongoose) as unknown as SchemaWithMeiliMethods;
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    for (const key of MEILI_ENV_KEYS) {
      if (savedMeiliEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedMeiliEnv[key];
      }
    }
  });

  beforeEach(async () => {
    await conversationModel.deleteMany({});
    mockAddDocuments.mockClear();
    mockUpdateDocuments.mockClear();
    mockDeleteDocument.mockClear();
    mockGetDocument.mockClear();
    mockGetDocument.mockReset();
  });

  const updateTitle = (conversationId: string, user: string, title: string) =>
    conversationModel.findOneAndUpdate(
      { conversationId, user },
      { $set: { title } },
      { new: true, upsert: true, includeResultMetadata: true },
    );

  test('re-indexes the updated title when the raw result wrapper is returned', async () => {
    const conversationId = new mongoose.Types.ObjectId().toString();
    const user = new mongoose.Types.ObjectId().toString();
    await conversationModel.create({
      conversationId,
      user,
      title: 'Original Title',
      endpoint: EModelEndpoint.openAI,
    });
    mockAddDocuments.mockClear();

    const result = await updateTitle(conversationId, user, 'Renamed Title');

    // `includeResultMetadata: true` resolves to the raw wrapper, not the document.
    expect((result as unknown as { value: unknown }).value).toBeTruthy();

    await waitForMock(mockAddDocuments);
    expect(mockAddDocuments).toHaveBeenCalledWith(
      [expect.objectContaining({ conversationId, title: 'Renamed Title' })],
      { primaryKey: 'conversationId' },
    );
  });

  test('upserting a new conversation via the raw result wrapper indexes it', async () => {
    const conversationId = new mongoose.Types.ObjectId().toString();
    const user = new mongoose.Types.ObjectId().toString();

    await conversationModel.findOneAndUpdate(
      { conversationId, user },
      { $set: { title: 'Fresh Conversation', endpoint: EModelEndpoint.openAI } },
      { new: true, upsert: true, includeResultMetadata: true },
    );

    await waitForMock(mockAddDocuments);
    expect(mockAddDocuments).toHaveBeenCalledWith(
      [expect.objectContaining({ conversationId, title: 'Fresh Conversation' })],
      { primaryKey: 'conversationId' },
    );
  });

  test('persists the _meiliIndex flag after indexing via the wrapper', async () => {
    const conversationId = new mongoose.Types.ObjectId().toString();
    const user = new mongoose.Types.ObjectId().toString();

    await updateTitle(conversationId, user, 'Indexed Conversation');
    await waitForMock(mockAddDocuments);
    await wait(50);

    const storedDoc = await conversationModel.collection.findOne({ conversationId });
    expect(storedDoc?._meiliIndex).toBe(true);
  });

  test('skips re-indexing when the title already matches the MeiliSearch document', async () => {
    const conversationId = new mongoose.Types.ObjectId().toString();
    const user = new mongoose.Types.ObjectId().toString();
    await conversationModel.create({
      conversationId,
      user,
      title: 'Same Title',
      endpoint: EModelEndpoint.openAI,
    });
    mockAddDocuments.mockClear();
    mockGetDocument.mockResolvedValueOnce({ conversationId, title: 'Same Title' });

    await updateTitle(conversationId, user, 'Same Title');

    await wait(50);
    expect(mockGetDocument).toHaveBeenCalledWith(conversationId);
    expect(mockAddDocuments).not.toHaveBeenCalled();
    expect(mockUpdateDocuments).not.toHaveBeenCalled();
  });

  test('does NOT index temporary conversations updated via the raw result wrapper', async () => {
    const conversationId = new mongoose.Types.ObjectId().toString();
    const user = new mongoose.Types.ObjectId().toString();
    await conversationModel.collection.insertOne({
      conversationId,
      user,
      title: 'Temporary Conversation',
      endpoint: EModelEndpoint.openAI,
      isTemporary: true,
      expiredAt: new Date(Date.now() + 60 * 60 * 1000),
      _meiliIndex: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await updateTitle(conversationId, user, 'Renamed Temporary Conversation');

    await wait(50);
    expect(mockAddDocuments).not.toHaveBeenCalled();
    expect(mockUpdateDocuments).not.toHaveBeenCalled();
  });
});
