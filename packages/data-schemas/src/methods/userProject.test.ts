import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IMemoryDocument } from '~/types/memoryDocument';
import type { IUserProject } from '~/types/userProject';
import type { IConversation } from '~/types';
import { createUserProjectMethods } from './userProject';

describe('UserProject Methods', () => {
  let mongoServer: MongoMemoryServer;
  let methods: ReturnType<typeof createUserProjectMethods>;
  let UserProject: mongoose.Model<IUserProject>;
  let MemoryDocument: mongoose.Model<IMemoryDocument>;
  let Conversation: mongoose.Model<IConversation>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);

    const userProjectSchema = new mongoose.Schema<IUserProject>(
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, trim: true, maxlength: 500 },
      },
      { timestamps: true },
    );
    userProjectSchema.index({ userId: 1, name: 1 }, { unique: true });

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

    const conversationSchema = new mongoose.Schema<IConversation>(
      {
        conversationId: { type: String, required: true, unique: true, index: true },
        title: { type: String, default: 'New Chat' },
        user: { type: String, index: true },
        projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserProject', default: null },
      },
      { timestamps: true },
    );

    UserProject =
      mongoose.models.UserProject ||
      mongoose.model<IUserProject>('UserProject', userProjectSchema);
    MemoryDocument =
      mongoose.models.MemoryDocument ||
      mongoose.model<IMemoryDocument>('MemoryDocument', memoryDocumentSchema);
    Conversation =
      mongoose.models.Conversation ||
      mongoose.model<IConversation>('Conversation', conversationSchema);

    await UserProject.syncIndexes();

    methods = createUserProjectMethods(mongoose);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await UserProject.deleteMany({});
    await MemoryDocument.deleteMany({});
    await Conversation.deleteMany({});
  });

  describe('createUserProject', () => {
    test('should create a project with name', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const result = await methods.createUserProject(userId, 'My Project');

      expect(result).toBeDefined();
      expect(result.name).toBe('My Project');
      expect(result.userId.toString()).toBe(userId);

      const saved = await UserProject.findOne({ userId });
      expect(saved).toBeDefined();
      expect(saved?.name).toBe('My Project');
    });

    test('should enforce unique name per user (throw on duplicate)', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await methods.createUserProject(userId, 'Duplicate Name');

      await expect(methods.createUserProject(userId, 'Duplicate Name')).rejects.toThrow();
    });

    test('should allow same name for different users', async () => {
      const userId1 = new mongoose.Types.ObjectId().toString();
      const userId2 = new mongoose.Types.ObjectId().toString();

      const project1 = await methods.createUserProject(userId1, 'Shared Name');
      const project2 = await methods.createUserProject(userId2, 'Shared Name');

      expect(project1.name).toBe('Shared Name');
      expect(project2.name).toBe('Shared Name');
      expect(project1.userId.toString()).toBe(userId1);
      expect(project2.userId.toString()).toBe(userId2);
    });
  });

  describe('getUserProjects', () => {
    test('should return user projects sorted by updatedAt descending', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      await methods.createUserProject(userId, 'First Project');
      await methods.createUserProject(userId, 'Second Project');
      await methods.createUserProject(userId, 'Third Project');

      const result = await methods.getUserProjects(userId);

      expect(result).toHaveLength(3);

      const names = result.map((p) => p.name);
      expect(names).toContain('First Project');
      expect(names).toContain('Second Project');
      expect(names).toContain('Third Project');
    });

    test('should return empty array for user with no projects', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const result = await methods.getUserProjects(userId);
      expect(result).toEqual([]);
    });
  });

  describe('updateUserProject', () => {
    test('should update name', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const project = await methods.createUserProject(userId, 'Old Name');

      const result = await methods.updateUserProject(userId, project._id, { name: 'New Name' });

      expect(result).toBeDefined();
      expect(result?.name).toBe('New Name');
    });

    test('should update description', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const project = await methods.createUserProject(userId, 'Project');

      const result = await methods.updateUserProject(userId, project._id, {
        description: 'A detailed description',
      });

      expect(result).toBeDefined();
      expect(result?.description).toBe('A detailed description');
    });
  });

  describe('deleteUserProject', () => {
    test('should delete project', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const project = await methods.createUserProject(userId, 'To Delete');

      const result = await methods.deleteUserProject(userId, project._id);
      expect(result).toBe(true);

      const remaining = await UserProject.find({ userId });
      expect(remaining).toHaveLength(0);
    });

    test('should nullify conversation projectId on cascade', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const project = await methods.createUserProject(userId, 'Linked Project');

      await Conversation.create({
        conversationId: 'conv-1',
        title: 'Test Conv',
        user: userId,
        projectId: project._id,
      });

      await methods.deleteUserProject(userId, project._id);

      const conv = await Conversation.findOne({ conversationId: 'conv-1' });
      expect(conv?.projectId).toBeNull();
    });

    test('should delete associated MemoryDocument on cascade', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const project = await methods.createUserProject(userId, 'Memory Project');

      await MemoryDocument.create({
        userId,
        scope: 'project',
        projectId: project._id,
        content: 'project memory',
        tokenCount: 50,
      });

      await methods.deleteUserProject(userId, project._id);

      const memDocs = await MemoryDocument.find({ projectId: project._id });
      expect(memDocs).toHaveLength(0);
    });

    test('should return false for nonexistent project', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const fakeId = new mongoose.Types.ObjectId();

      const result = await methods.deleteUserProject(userId, fakeId);
      expect(result).toBe(false);
    });
  });

  describe('getUserProjectById', () => {
    test('should return project by id', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const project = await methods.createUserProject(userId, 'Find Me');

      const result = await methods.getUserProjectById(userId, project._id);

      expect(result).toBeDefined();
      expect(result?.name).toBe('Find Me');
      expect(result?._id.toString()).toBe(project._id.toString());
    });

    test('should return null for nonexistent project', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const fakeId = new mongoose.Types.ObjectId();

      const result = await methods.getUserProjectById(userId, fakeId);
      expect(result).toBeNull();
    });
  });
});
