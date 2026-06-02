import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '~/models';
import type { IChatProject, IConversation } from '~/types';
import { createChatProjectMethods, type ChatProjectMethods } from './chatProject';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let ChatProject: mongoose.Model<IChatProject>;
let Conversation: mongoose.Model<IConversation>;
let methods: ChatProjectMethods;
let modelsToCleanup: string[] = [];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);

  ChatProject = mongoose.models.ChatProject as mongoose.Model<IChatProject>;
  Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;
  methods = createChatProjectMethods(mongoose);

  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();

  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }
});

afterEach(async () => {
  await ChatProject.deleteMany({});
  await Conversation.deleteMany({});
});

async function createConversation(user: string, conversationId: string, title: string) {
  return await Conversation.create({
    conversationId,
    title,
    user,
    endpoint: 'openAI',
  });
}

describe('ChatProject methods', () => {
  const user = 'user-1';
  const otherUser = 'user-2';

  it('creates, reads, updates, and lists private projects', async () => {
    const project = await methods.createChatProject(user, {
      name: 'Customer Alpha',
      description: 'Support work',
    });

    expect(project.name).toBe('Customer Alpha');
    expect(project.conversationCount).toBe(0);

    const readProject = await methods.getChatProject(user, project._id!.toString());
    expect(readProject?.description).toBe('Support work');

    const updatedProject = await methods.updateChatProject(user, project._id!.toString(), {
      name: 'Customer Alpha Updated',
    });
    expect(updatedProject?.name).toBe('Customer Alpha Updated');

    const list = await methods.listChatProjects(user, { sortBy: 'name', sortDirection: 'asc' });
    expect(list.projects).toHaveLength(1);
    expect(list.projects[0].name).toBe('Customer Alpha Updated');
  });

  it('assigns many conversations to one project and updates stats', async () => {
    const project = await methods.createChatProject(user, { name: 'Customer Alpha' });
    await createConversation(user, 'convo-1', 'First');
    await createConversation(user, 'convo-2', 'Second');

    await methods.assignConversationToProject(user, 'convo-1', project._id!.toString());
    await methods.assignConversationToProject(user, 'convo-2', project._id!.toString());

    const conversations = await Conversation.find({
      user,
      chatProjectId: project._id!.toString(),
    }).lean<IConversation[]>();
    const refreshedProject = await methods.getChatProject(user, project._id!.toString());

    expect(conversations).toHaveLength(2);
    expect(refreshedProject?.conversationCount).toBe(2);
    expect(refreshedProject?.lastConversationId).toBeDefined();
  });

  it('enforces one project per chat when moving conversations', async () => {
    const firstProject = await methods.createChatProject(user, { name: 'First' });
    const secondProject = await methods.createChatProject(user, { name: 'Second' });
    await createConversation(user, 'convo-1', 'First');

    await methods.assignConversationToProject(user, 'convo-1', firstProject._id!.toString());
    await methods.assignConversationToProject(user, 'convo-1', secondProject._id!.toString());

    const movedConversation = await Conversation.findOne({ user, conversationId: 'convo-1' }).lean<
      IConversation
    >();
    const refreshedFirst = await methods.getChatProject(user, firstProject._id!.toString());
    const refreshedSecond = await methods.getChatProject(user, secondProject._id!.toString());

    expect(movedConversation?.chatProjectId).toBe(secondProject._id!.toString());
    expect(refreshedFirst?.conversationCount).toBe(0);
    expect(refreshedSecond?.conversationCount).toBe(1);
  });

  it('deleting a project unassigns chats instead of deleting them', async () => {
    const project = await methods.createChatProject(user, { name: 'Delete me' });
    await createConversation(user, 'convo-1', 'First');
    await methods.assignConversationToProject(user, 'convo-1', project._id!.toString());

    const result = await methods.deleteChatProject(user, project._id!.toString());
    const conversation = await Conversation.findOne({ user, conversationId: 'convo-1' }).lean<
      IConversation
    >();

    expect(result.deletedCount).toBe(1);
    expect(result.modifiedCount).toBe(1);
    expect(conversation).not.toBeNull();
    expect(conversation?.chatProjectId).toBeUndefined();
  });

  it('isolates projects and assignments by user', async () => {
    const project = await methods.createChatProject(user, { name: 'Mine' });
    await createConversation(otherUser, 'convo-1', 'Theirs');

    const otherRead = await methods.getChatProject(otherUser, project._id!.toString());
    const assignment = await methods.assignConversationToProject(
      user,
      'convo-1',
      project._id!.toString(),
    );
    const deleteResult = await methods.deleteChatProject(otherUser, project._id!.toString());

    expect(otherRead).toBeNull();
    expect(assignment).toBeNull();
    expect(deleteResult.deletedCount).toBe(0);
  });
});

