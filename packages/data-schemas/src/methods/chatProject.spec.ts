import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { IChatProject, IConversation } from '~/types';
import {
  createChatProjectMethods,
  updateChatProjectLastConversationForUser,
  type ChatProjectMethods,
} from './chatProject';
import { tenantStorage } from '~/config/tenantContext';
import { createModels } from '~/models';

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

  it('uses portable project lookup stages before cursor pagination', async () => {
    const project = await methods.createChatProject(user, { name: 'Portable' });
    const aggregate = jest.spyOn(ChatProject, 'aggregate');
    try {
      await methods.getChatProject(user, String(project._id));
      await methods.listChatProjects(user);
      for (const [pipeline] of aggregate.mock.calls) {
        expect(pipeline).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              $lookup: expect.objectContaining({
                localField: 'statsProjectId',
                foreignField: 'chatProjectId',
              }),
            }),
          ]),
        );
        for (const stage of pipeline ?? []) {
          expect(stage).not.toHaveProperty('$set');
          expect(stage).not.toHaveProperty('$unset');
          if ('$lookup' in stage) {
            expect(stage.$lookup).not.toHaveProperty('let');
            expect(stage.$lookup).not.toHaveProperty('pipeline');
          }
        }
      }
    } finally {
      aggregate.mockRestore();
    }
  });

  it.each([
    ['name', 'asc'],
    ['name', 'desc'],
    ['createdAt', 'asc'],
    ['createdAt', 'desc'],
  ] as const)('pages before joining conversations for %s %s', async (sortBy, sortDirection) => {
    for (let index = 0; index < 6; index++) {
      const project = await ChatProject.create({
        user,
        name: `Project ${index}`,
        createdAt: new Date(2026, 0, index + 1),
      });
      await Conversation.collection.insertOne({
        user,
        conversationId: `conversation-${index}`,
        chatProjectId: String(project._id),
        updatedAt: new Date(2026, 1, 6 - index),
      });
    }
    const aggregate = jest.spyOn(ChatProject, 'aggregate');
    try {
      const names: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await methods.listChatProjects(user, {
          sortBy,
          sortDirection,
          limit: 2,
          cursor,
        });
        names.push(...page.projects.map((project) => project.name));
        expect(page.projects.every((project) => project.conversationCount === 1)).toBe(true);
        cursor = page.nextCursor;
      } while (cursor);
      const expected = Array.from({ length: 6 }, (_, index) => `Project ${index}`);
      expect(names).toEqual(sortDirection === 'asc' ? expected : expected.reverse());
      const pipelines = aggregate.mock.calls.map(([pipeline]) => pipeline ?? []);
      for (const pipeline of pipelines) {
        const lookupIndex = pipeline.findIndex((stage) => '$lookup' in stage);
        const prefix = pipeline.slice(0, lookupIndex);
        expect(prefix).toContainEqual({ $limit: 3 });
        const admitted = await ChatProject.aggregate(prefix);
        expect(admitted.length).toBeLessThanOrEqual(3);
      }
    } finally {
      aggregate.mockRestore();
    }
  });

  it('filters projects by name or description search', async () => {
    await methods.createChatProject(user, {
      name: 'Customer Alpha',
      description: 'Support work',
    });
    await methods.createChatProject(user, {
      name: 'Internal Tools',
      description: 'Overflow menu test',
    });

    const byName = await methods.listChatProjects(user, { search: 'alpha' });
    expect(byName.projects.map((project) => project.name)).toEqual(['Customer Alpha']);

    const byDescription = await methods.listChatProjects(user, { search: 'overflow' });
    expect(byDescription.projects.map((project) => project.name)).toEqual(['Internal Tools']);

    const noMatch = await methods.listChatProjects(user, { search: 'zzzz' });
    expect(noMatch.projects).toHaveLength(0);
  });

  it.each([undefined, 'tenant-a'])(
    'reads committed statistics without repairing cache in tenant %s',
    async (tenantId) => {
      await tenantStorage.run({ tenantId }, async () => {
        const project = await methods.createChatProject(user, { name: 'Stale cache' });
        const projectId = String(project._id);
        await ChatProject.updateOne(
          { _id: project._id },
          {
            $set: {
              conversationCount: 999,
              lastConversationId: 'hidden',
              lastConversationAt: new Date('2026-09-01'),
            },
          },
        );
        const scope = { user, ...(tenantId ? { tenantId } : {}), chatProjectId: projectId };
        await Conversation.collection.insertMany([
          { ...scope, conversationId: 'visible', updatedAt: new Date('2026-01-01') },
          {
            ...scope,
            conversationId: 'archived',
            isArchived: true,
            updatedAt: new Date('2026-08-01'),
          },
          { ...scope, conversationId: 'temporary', isTemporary: true },
          {
            ...scope,
            conversationId: 'expired',
            isTemporary: false,
            expiredAt: new Date('2020-01-01'),
          },
          { ...scope, user: otherUser, conversationId: 'foreign-owner' },
          { ...scope, tenantId: 'foreign-tenant', conversationId: 'foreign-tenant' },
        ]);
        const expected = {
          conversationCount: 1,
          lastConversationId: 'visible',
          lastConversationAt: new Date('2026-01-01'),
        };
        expect(await methods.getChatProject(user, projectId)).toMatchObject(expected);
        expect((await methods.listChatProjects(user)).projects).toEqual([
          expect.objectContaining(expected),
        ]);
        expect(await ChatProject.findById(project._id).lean()).toMatchObject({
          conversationCount: 999,
          lastConversationId: 'hidden',
        });
        await Conversation.updateOne({ conversationId: 'visible' }, { $set: { isArchived: true } });
        expect(await methods.getChatProject(user, projectId)).toMatchObject({
          conversationCount: 0,
          lastConversationId: null,
          lastConversationAt: null,
        });
      });
    },
  );

  it('paginates projects deterministically when latest activity is null', async () => {
    const staleProject = await methods.createChatProject(user, { name: 'Stale' });
    await methods.createChatProject(user, { name: 'Quiet A' });
    await methods.createChatProject(user, { name: 'Quiet B' });
    const recentProject = await methods.createChatProject(user, { name: 'Recent' });

    await Conversation.collection.insertOne({
      user,
      conversationId: 'staleProject',
      chatProjectId: String(staleProject._id),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await Conversation.collection.insertOne({
      user,
      conversationId: 'recentProject',
      chatProjectId: String(recentProject._id),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    const firstPage = await methods.listChatProjects(user, {
      sortBy: 'lastConversationAt',
      sortDirection: 'desc',
      limit: 3,
    });
    const secondPage = await methods.listChatProjects(user, {
      sortBy: 'lastConversationAt',
      sortDirection: 'desc',
      limit: 3,
      cursor: firstPage.nextCursor,
    });
    const names = [...firstPage.projects, ...secondPage.projects].map((project) => project.name);

    expect(firstPage.projects[0].name).toBe('Recent');
    expect(firstPage.projects[1].name).toBe('Stale');
    expect(firstPage.nextCursor).toBeTruthy();
    expect(secondPage.projects.every((project) => project.lastConversationAt == null)).toBe(true);
    expect(names).toEqual(expect.arrayContaining(['Recent', 'Stale', 'Quiet A', 'Quiet B']));
    expect(new Set(names).size).toBe(4);

    const invalidCursor = Buffer.from(
      JSON.stringify({ primary: 'not-a-date', id: recentProject._id!.toString() }),
    ).toString('base64');
    const invalidCursorPage = await methods.listChatProjects(user, {
      sortBy: 'lastConversationAt',
      sortDirection: 'desc',
      limit: 1,
      cursor: invalidCursor,
    });

    expect(invalidCursorPage.projects[0].name).toBe('Recent');
  });

  it('paginates chat-less projects when a page ends on the last dated project', async () => {
    const staleProject = await methods.createChatProject(user, { name: 'Stale' });
    await methods.createChatProject(user, { name: 'Quiet A' });
    await methods.createChatProject(user, { name: 'Quiet B' });
    const recentProject = await methods.createChatProject(user, { name: 'Recent' });

    await Conversation.collection.insertOne({
      user,
      conversationId: 'staleProject',
      chatProjectId: String(staleProject._id),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await Conversation.collection.insertOne({
      user,
      conversationId: 'recentProject',
      chatProjectId: String(recentProject._id),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    // limit equals the number of dated projects, so the cursor lands on a dated
    // project; the null (chat-less) projects must still appear on the next page.
    const firstPage = await methods.listChatProjects(user, {
      sortBy: 'lastConversationAt',
      sortDirection: 'desc',
      limit: 2,
    });
    const secondPage = await methods.listChatProjects(user, {
      sortBy: 'lastConversationAt',
      sortDirection: 'desc',
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    expect(firstPage.projects.map((project) => project.name)).toEqual(['Recent', 'Stale']);
    expect(firstPage.nextCursor).toBeTruthy();
    expect(secondPage.projects.map((project) => project.name).sort()).toEqual([
      'Quiet A',
      'Quiet B',
    ]);
    expect(secondPage.projects.every((project) => project.lastConversationAt == null)).toBe(true);
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

  it('excludes retention-hidden conversations from project stats', async () => {
    const project = await methods.createChatProject(user, { name: 'Visible Stats' });
    const chatProjectId = project._id!.toString();
    const visibleDate = new Date('2026-01-01T00:00:00.000Z');
    const hiddenDate = new Date('2026-02-01T00:00:00.000Z');

    await Conversation.collection.insertMany([
      {
        conversationId: 'visible-convo',
        title: 'Visible',
        user,
        endpoint: 'openAI',
        chatProjectId,
        isTemporary: false,
        expiredAt: null,
        createdAt: visibleDate,
        updatedAt: visibleDate,
      },
      {
        conversationId: 'temporary-convo',
        title: 'Temporary',
        user,
        endpoint: 'openAI',
        chatProjectId,
        isTemporary: true,
        expiredAt: new Date('2027-03-01T00:00:00.000Z'),
        createdAt: hiddenDate,
        updatedAt: hiddenDate,
      },
      {
        conversationId: 'expired-convo',
        title: 'Expired',
        user,
        endpoint: 'openAI',
        chatProjectId,
        isTemporary: false,
        expiredAt: new Date('2025-12-01T00:00:00.000Z'),
        createdAt: hiddenDate,
        updatedAt: hiddenDate,
      },
    ]);

    const refreshedProject = await methods.refreshChatProjectStats(user, chatProjectId);

    expect(refreshedProject?.conversationCount).toBe(1);
    expect(refreshedProject?.lastConversationId).toBe('visible-convo');
    expect(refreshedProject?.lastConversationAt?.toISOString()).toBe(visibleDate.toISOString());
  });

  it('retries instead of overwriting a newer concurrent stats update', async () => {
    const project = await methods.createChatProject(user, { name: 'Concurrent Stats' });
    const chatProjectId = project._id!.toString();
    const initialDate = new Date('2026-01-01T00:00:00.000Z');
    const newerDate = new Date('2026-02-01T00:00:00.000Z');

    await Conversation.collection.insertOne({
      conversationId: 'initial-convo',
      title: 'Initial',
      user,
      endpoint: 'openAI',
      chatProjectId,
      createdAt: initialDate,
      updatedAt: initialDate,
    });
    await ChatProject.findByIdAndUpdate(project._id, {
      conversationCount: 1,
      lastConversationAt: initialDate,
      lastConversationId: 'initial-convo',
    });

    const findOneAndUpdate = ChatProject.findOneAndUpdate.bind(ChatProject);
    const updateSpy = jest
      .spyOn(ChatProject, 'findOneAndUpdate')
      .mockImplementationOnce((filter, update, options) => {
        const query = findOneAndUpdate(filter, update, options);
        const exec = query.exec.bind(query);
        jest.spyOn(query, 'exec').mockImplementationOnce(async () => {
          await Conversation.collection.insertOne({
            conversationId: 'newer-convo',
            title: 'Newer',
            user,
            endpoint: 'openAI',
            chatProjectId,
            createdAt: newerDate,
            updatedAt: newerDate,
          });
          await ChatProject.updateOne(
            { _id: project._id },
            {
              conversationCount: 2,
              lastConversationAt: newerDate,
              lastConversationId: 'newer-convo',
            },
          );
          return await exec();
        });
        return query;
      });

    try {
      const refreshed = await methods.refreshChatProjectStats(user, chatProjectId);

      expect(refreshed?.conversationCount).toBe(2);
      expect(refreshed?.lastConversationId).toBe('newer-convo');
      expect(refreshed?.lastConversationAt?.toISOString()).toBe(newerDate.toISOString());
      expect(updateSpy).toHaveBeenCalledTimes(2);
    } finally {
      updateSpy.mockRestore();
    }

    const persisted = await ChatProject.findById(project._id).lean<IChatProject>();
    expect(persisted?.conversationCount).toBe(2);
    expect(persisted?.lastConversationId).toBe('newer-convo');
    expect(persisted?.lastConversationAt?.toISOString()).toBe(newerDate.toISOString());
  });

  it('keeps reconciling after the first three optimistic attempts lose the race', async () => {
    const project = await methods.createChatProject(user, { name: 'Exhausted Then Succeeds' });
    const chatProjectId = project._id!.toString();
    await ChatProject.findByIdAndUpdate(project._id, {
      conversationCount: 4,
      lastConversationId: 'stale-convo',
    });

    let casAttempts = 0;
    const findOneAndUpdate = ChatProject.findOneAndUpdate.bind(ChatProject);
    const updateSpy = jest
      .spyOn(ChatProject, 'findOneAndUpdate')
      .mockImplementation((filter, update, options) => {
        const query = findOneAndUpdate(filter, update, options);
        const exec = query.exec.bind(query);
        jest.spyOn(query, 'exec').mockImplementation(async () => {
          casAttempts += 1;
          if (casAttempts <= 3) {
            await ChatProject.updateOne(
              { _id: project._id },
              {
                lastConversationAt: new Date(`2026-03-0${casAttempts}T00:00:00.000Z`),
                lastConversationId: `concurrent-${casAttempts}`,
              },
            );
          }
          return await exec();
        });
        return query;
      });

    try {
      const refreshed = await methods.refreshChatProjectStats(user, chatProjectId);
      expect(refreshed?.conversationCount).toBe(0);
      expect(refreshed?.lastConversationId).toBeNull();
      expect(casAttempts).toBeGreaterThan(3);
    } finally {
      updateSpy.mockRestore();
    }

    const persisted = await ChatProject.findById(project._id).lean<IChatProject>();
    expect(persisted?.conversationCount).toBe(0);
    expect(persisted?.lastConversationId).toBeNull();
  });

  it('throws instead of returning stale stats when every optimistic write loses', async () => {
    const project = await methods.createChatProject(user, { name: 'Never Settles' });
    const chatProjectId = project._id!.toString();
    await ChatProject.findByIdAndUpdate(project._id, {
      conversationCount: 4,
      lastConversationId: 'stale-convo',
    });

    const updateSpy = jest.spyOn(ChatProject, 'findOneAndUpdate').mockImplementation(
      () =>
        ({
          lean: async () => null,
        }) as unknown as ReturnType<typeof ChatProject.findOneAndUpdate>,
    );

    try {
      await expect(methods.refreshChatProjectStats(user, chatProjectId)).rejects.toThrow(
        /refresh chat project stats/i,
      );
    } finally {
      updateSpy.mockRestore();
    }

    const persisted = await ChatProject.findById(project._id).lean<IChatProject>();
    expect(persisted?.conversationCount).toBe(4);
    expect(persisted?.lastConversationId).toBe('stale-convo');
  });

  it('does not increment again when a refresh already counted the new conversation', async () => {
    const project = await methods.createChatProject(user, { name: 'Pending Increment' });
    const chatProjectId = project._id!.toString();
    const createdAt = new Date('2026-04-01T00:00:00.000Z');
    await Conversation.create({
      conversationId: 'new-convo',
      title: 'New',
      user,
      endpoint: 'openAI',
      chatProjectId,
      createdAt,
      updatedAt: createdAt,
    });

    const refreshed = await methods.refreshChatProjectStats(user, chatProjectId);
    expect(refreshed?.conversationCount).toBe(1);
    expect(refreshed?.lastConversationId).toBe('new-convo');

    await updateChatProjectLastConversationForUser(
      mongoose,
      user,
      chatProjectId,
      {
        conversationId: 'new-convo',
        createdAt,
        updatedAt: createdAt,
      },
      true,
    );

    const persisted = await ChatProject.findById(project._id).lean<IChatProject>();
    expect(persisted?.conversationCount).toBe(1);
    expect(persisted?.lastConversationId).toBe('new-convo');
  });

  it('enforces one project per chat when moving conversations', async () => {
    const firstProject = await methods.createChatProject(user, { name: 'First' });
    const secondProject = await methods.createChatProject(user, { name: 'Second' });
    await createConversation(user, 'convo-1', 'First');

    await methods.assignConversationToProject(user, 'convo-1', firstProject._id!.toString());
    await methods.assignConversationToProject(user, 'convo-1', secondProject._id!.toString());

    const movedConversation = await Conversation.findOne({
      user,
      conversationId: 'convo-1',
    }).lean<IConversation>();
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
    const conversation = await Conversation.findOne({
      user,
      conversationId: 'convo-1',
    }).lean<IConversation>();

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

describe('required project lookup index', () => {
  it('installs and uses the foreign-key index with automatic indexing disabled', async () => {
    const isolated = new mongoose.Mongoose();
    await isolated.connect(mongoServer.getUri('project-index'), { autoIndex: false });
    createModels(isolated);
    const Project = isolated.models.ChatProject;
    const Convo = isolated.models.Conversation;
    const localMethods = createChatProjectMethods(isolated);
    const project = await localMethods.createChatProject('owner', { name: 'Indexed project' });
    await Convo.collection.insertMany([
      {
        user: 'owner',
        conversationId: 'member',
        chatProjectId: String(project._id),
        updatedAt: new Date(),
      },
      ...Array.from({ length: 1000 }, (_, index) => ({
        user: 'other-owner',
        conversationId: `other-${index}`,
        chatProjectId: `other-project-${index}`,
      })),
    ]);
    const build = jest.spyOn(Convo.collection, 'createIndex');
    const aggregate = jest.spyOn(Project, 'aggregate');
    try {
      build.mockRejectedValueOnce(new Error('DDL unavailable'));
      await expect(localMethods.getChatProject('owner', String(project._id))).rejects.toThrow(
        'DDL unavailable',
      );
      expect(aggregate).not.toHaveBeenCalled();
      expect(await localMethods.getChatProject('owner', String(project._id))).toMatchObject({
        conversationCount: 1,
      });
      const pipeline = aggregate.mock.calls[0][0];
      const explain = await Project.aggregate(pipeline).explain('executionStats');
      const lookup = explain.stages.find((stage: Record<string, unknown>) => '$lookup' in stage);
      expect(lookup.indexesUsed).toContain('chatProjectId_1');
      expect(lookup.totalDocsExamined).toBeLessThan(10);
      await localMethods.listChatProjects('owner');
      expect(build).toHaveBeenCalledTimes(2);
    } finally {
      build.mockRestore();
      aggregate.mockRestore();
      await isolated.connection.dropDatabase();
      await isolated.disconnect();
    }
  });
});
