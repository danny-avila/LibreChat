import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IMemoryDocumentLean } from '~/types/memoryDocument';
import type { IUserProjectLean } from '~/types/userProject';
import type { IMemoryDocument } from '~/types/memoryDocument';
import type { IUserProject } from '~/types/userProject';
import { createMemoryDocumentMethods } from './memoryDocument';

describe('MemoryDocument Methods', () => {
  let mongoServer: MongoMemoryServer;
  let methods: ReturnType<typeof createMemoryDocumentMethods>;
  let MemoryDocument: mongoose.Model<IMemoryDocument>;
  let UserProject: mongoose.Model<IUserProject>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    const memoryDocumentSchema = new mongoose.Schema<IMemoryDocument>(
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        scope: { type: String, enum: ['global', 'project'], required: true },
        projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserProject', default: null },
        content: { type: String, default: '' },
        tokenCount: { type: Number, default: 0 },
      },
      { timestamps: true },
    );
    memoryDocumentSchema.index({ userId: 1, scope: 1, projectId: 1 }, { unique: true });

    const userProjectSchema = new mongoose.Schema<IUserProject>(
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, trim: true, maxlength: 500 },
      },
      { timestamps: true },
    );
    userProjectSchema.index({ userId: 1, name: 1 }, { unique: true });

    MemoryDocument =
      mongoose.models.MemoryDocument ||
      mongoose.model<IMemoryDocument>('MemoryDocument', memoryDocumentSchema);
    UserProject =
      mongoose.models.UserProject ||
      mongoose.model<IUserProject>('UserProject', userProjectSchema);

    methods = createMemoryDocumentMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await MemoryDocument.deleteMany({});
    await UserProject.deleteMany({});
  });

  describe('getMemoryDocumentsByUser', () => {
    test('should return empty array for user with no documents', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const result = await methods.getMemoryDocumentsByUser(userId);
      expect(result).toEqual([]);
    });

    test('should return all documents for a user', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const projectId = new mongoose.Types.ObjectId();

      await MemoryDocument.create([
        { userId, scope: 'global', content: 'global memory', tokenCount: 10 },
        { userId, scope: 'project', projectId, content: 'project memory', tokenCount: 20 },
      ]);

      const result = await methods.getMemoryDocumentsByUser(userId);

      expect(result).toHaveLength(2);
      expect(result.map((d: IMemoryDocumentLean) => d.scope).sort()).toEqual(['global', 'project']);
    });

    test('should not return other users documents', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();

      await MemoryDocument.create([
        { userId: userId1, scope: 'global', content: 'user1 memory', tokenCount: 5 },
        { userId: userId2, scope: 'global', content: 'user2 memory', tokenCount: 8 },
      ]);

      const result = await methods.getMemoryDocumentsByUser(userId1);

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('user1 memory');
    });
  });

  describe('upsertMemoryDocument', () => {
    test('should create a new global document', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const result = await methods.upsertMemoryDocument({
        userId,
        scope: 'global',
        content: 'global notes',
        tokenCount: 15,
      });

      expect(result).toBeDefined();
      expect(result?.scope).toBe('global');
      expect(result?.content).toBe('global notes');
      expect(result?.tokenCount).toBe(15);

      const saved = await MemoryDocument.findOne({ userId, scope: 'global' });
      expect(saved).toBeDefined();
      expect(saved?.content).toBe('global notes');
    });

    test('should create a new project document', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const projectId = new mongoose.Types.ObjectId().toString();

      const result = await methods.upsertMemoryDocument({
        userId,
        scope: 'project',
        projectId,
        content: 'project notes',
        tokenCount: 25,
      });

      expect(result).toBeDefined();
      expect(result?.scope).toBe('project');
      expect(result?.content).toBe('project notes');
      expect(result?.projectId?.toString()).toBe(projectId);
    });

    test('should update existing document on second call (upsert)', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await methods.upsertMemoryDocument({
        userId,
        scope: 'global',
        content: 'first version',
        tokenCount: 10,
      });

      const result = await methods.upsertMemoryDocument({
        userId,
        scope: 'global',
        content: 'second version',
        tokenCount: 20,
      });

      expect(result?.content).toBe('second version');

      const docs = await MemoryDocument.find({ userId, scope: 'global' });
      expect(docs).toHaveLength(1);
      expect(docs[0].content).toBe('second version');
    });

    test('should update tokenCount on update', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await methods.upsertMemoryDocument({
        userId,
        scope: 'global',
        content: 'content',
        tokenCount: 100,
      });

      const result = await methods.upsertMemoryDocument({
        userId,
        scope: 'global',
        content: 'updated content',
        tokenCount: 200,
      });

      expect(result?.tokenCount).toBe(200);
    });
  });

  describe('deleteMemoryDocument', () => {
    test('should delete a document by scope and user', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await MemoryDocument.create({
        userId,
        scope: 'global',
        content: 'to be deleted',
        tokenCount: 5,
      });

      const result = await methods.deleteMemoryDocument(userId, 'global');
      expect(result).toBe(true);

      const remaining = await MemoryDocument.find({ userId });
      expect(remaining).toHaveLength(0);
    });

    test('should return false for nonexistent document', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const result = await methods.deleteMemoryDocument(userId, 'global');
      expect(result).toBe(false);
    });
  });

  describe('getMemoryDocuments (scoped)', () => {
    test('should return global content when no projectId is provided', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await MemoryDocument.create({
        userId,
        scope: 'global',
        content: 'global knowledge',
        tokenCount: 30,
      });

      const result = await methods.getMemoryDocuments({ userId });

      expect(result.globalContent).toBe('global knowledge');
      expect(result.projectContent).toBe('');
      expect(result.totalTokens).toBe(30);
    });

    test('should return both global and project content when projectId is provided', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const projectId = new mongoose.Types.ObjectId();

      await UserProject.create({ _id: projectId, userId, name: 'My Project' });
      await MemoryDocument.create([
        { userId, scope: 'global', content: 'global stuff', tokenCount: 10 },
        { userId, scope: 'project', projectId, content: 'project stuff', tokenCount: 20 },
      ]);

      const result = await methods.getMemoryDocuments({ userId, projectId: projectId.toString() });

      expect(result.globalContent).toBe('global stuff');
      expect(result.projectContent).toBe('project stuff');
      expect(result.projectName).toBe('My Project');
      expect(result.totalTokens).toBe(30);
    });

    test('should return empty result for user with no documents', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const result = await methods.getMemoryDocuments({ userId });

      expect(result.globalContent).toBe('');
      expect(result.projectContent).toBe('');
      expect(result.projectName).toBe('');
      expect(result.totalTokens).toBe(0);
    });
  });
});
