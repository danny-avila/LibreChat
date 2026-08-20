import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '~/models';

/**
 * Issue #14988: a file embedded under an entity (an agent knowledge base
 * today) can only be deleted from the vector store by naming that entity. The
 * File row is the only durable place LibreChat can keep it.
 */
describe('File schema: embed owner', () => {
  let File: mongoose.Model<Record<string, unknown>>;
  let mongoServer: MongoMemoryServer;
  let modelsToCleanup: string[] = [];

  const baseFile = () => ({
    file_id: uuidv4(),
    user: new mongoose.Types.ObjectId(),
    filename: 'knowledge.txt',
    filepath: '/uploads/knowledge.txt',
    type: 'text/plain',
    bytes: 100,
    embedded: true,
  });

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    const models = createModels(mongoose);
    modelsToCleanup = Object.keys(models);
    Object.assign(mongoose.models, models);

    File = mongoose.models.File as mongoose.Model<Record<string, unknown>>;
    await File.init();
  });

  afterAll(async () => {
    for (const key in mongoose.connection.collections) {
      await mongoose.connection.collections[key].deleteMany({});
    }
    for (const modelName of modelsToCleanup) {
      delete mongoose.models[modelName];
    }
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await File.deleteMany({});
  });

  it('persists the entity a file was embedded under', async () => {
    const created = await File.create({ ...baseFile(), entity_id: 'agent-abc' });

    const stored = await File.findById(created._id).lean();
    expect(stored?.entity_id).toBe('agent-abc');
  });

  it('leaves the field absent for a file with no owning entity', async () => {
    /* Invariant 11: nothing is backfilled onto files that have no owner, so
     * "no entity" must be distinguishable from "entity unknown". */
    const created = await File.create(baseFile());

    const stored = await File.findById(created._id).lean();
    expect(stored).not.toHaveProperty('entity_id');
  });

  it('indexes the owning entity, so a backfill can find every file of one entity', async () => {
    const indexes = await File.collection.indexes();

    expect(indexes.map((index) => index.key)).toContainEqual({ entity_id: 1 });
  });
});
