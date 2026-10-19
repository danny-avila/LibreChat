import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { FileContext, FileSources } from 'librechat-data-provider';
import { createModels, createMethods } from '@librechat/data-schemas';
import type { CodeOutputStoredFile } from '~/files/code/publication';
import type { ProjectOutputRequest } from './outputs';
import { getChatProjectContextKey, resolveChatProjectContext } from './context';
import { createProjectOutputSaver } from './outputs';

let mongo: MongoMemoryServer;
let modelNames: string[];

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  const models = createModels(mongoose);
  modelNames = Object.keys(models);
  Object.assign(mongoose.models, models);
  await mongoose.connect(mongo.getUri());
});

afterEach(async () => {
  await Promise.all(
    ['ChatProject', 'Conversation', 'File'].map((name) => mongoose.models[name].deleteMany({})),
  );
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  for (const name of modelNames) delete mongoose.models[name];
});

async function setup() {
  const methods = createMethods(mongoose);
  const userId = new mongoose.Types.ObjectId().toString();
  const project = await methods.createChatProject(userId, { name: 'Shared analysis' });
  const projectId = project._id!.toString();
  await mongoose.models.Conversation.create({
    user: userId,
    conversationId: 'analysis-chat',
    endpoint: 'agents',
    chatProjectId: projectId,
  });
  const outputs: CodeOutputStoredFile[] = ['first', 'second'].map((file_id) => ({
    file_id,
    user: userId,
    filename: `${file_id}.csv`,
    filepath: `/uploads/${file_id}.csv`,
    conversationId: 'analysis-chat',
    source: FileSources.local,
    context: FileContext.execute_code,
    bytes: 10,
    type: 'text/csv',
    object: 'file',
    embedded: false,
    usage: 1,
  }));
  await mongoose.models.File.create(outputs);
  const req: ProjectOutputRequest = {
    user: { id: userId },
    config: { projects: { codeExecution: true } },
    chatProjectContext: {
      projectId,
      contextRevision: 0,
      instructions: '',
      file_ids: [],
      resources: [],
    },
  };
  const logger = { warn: jest.fn() };
  return { req, outputs, methods, logger, save: createProjectOutputSaver({ ...methods, logger }) };
}

it('serializes simultaneous outputs and leaves the approval snapshot compatible with a later turn', async () => {
  const { req, outputs, methods, save } = await setup();
  expect(await Promise.all(outputs.map((file) => save(req, file)))).toEqual([
    { projectId: req.chatProjectContext!.projectId, status: 'added' },
    { projectId: req.chatProjectContext!.projectId, status: 'added' },
  ]);
  const restored = await resolveChatProjectContext(
    {
      userId: req.user.id,
      conversationId: 'analysis-chat',
      codeExecution: true,
    },
    methods,
  );
  expect(getChatProjectContextKey(req.chatProjectContext)).toBe(getChatProjectContextKey(restored));
  expect(restored?.resources.map((file) => file.file_id)).toEqual(['first', 'second']);
  const resource = req.chatProjectContext?.resources[0];
  if (resource?.availability !== 'ready') throw new Error('The output is unavailable');
  expect(resource.file).not.toHaveProperty('text');
});

it('refreshes an existing member without changing resource order or invalidating its approval key', async () => {
  const { req, outputs, methods, save } = await setup();
  await Promise.all(outputs.map((file) => save(req, file)));
  await mongoose.models.File.updateOne(
    { file_id: outputs[0].file_id },
    { $set: { bytes: 20, 'metadata.sourceDispatchedAt': Date.now() } },
  );
  expect(await save(req, outputs[0])).toEqual({
    projectId: req.chatProjectContext!.projectId,
    status: 'added',
  });
  const restored = await resolveChatProjectContext(
    { userId: req.user.id, conversationId: 'analysis-chat', codeExecution: true },
    methods,
  );
  expect(req.chatProjectContext?.resources.map((file) => file.file_id)).toEqual([
    'first',
    'second',
  ]);
  expect(getChatProjectContextKey(req.chatProjectContext)).toBe(getChatProjectContextKey(restored));
});

it('does no project mutation with the capability disabled or outside a project', async () => {
  const { req, outputs, methods, save } = await setup();
  req.config!.projects!.codeExecution = false;
  expect(await save(req, outputs[0])).toBeUndefined();
  req.config!.projects!.codeExecution = true;
  req.chatProjectContext = null;
  expect(await save(req, outputs[0])).toBeUndefined();
  expect(
    (
      await methods.getChatProject(
        req.user.id,
        (await methods.listChatProjects(req.user.id)).projects[0]._id!.toString(),
      )
    )?.file_ids,
  ).toEqual([]);
});

it('preserves the chat output and translates an operational failure into a safe project-save code', async () => {
  const { req, outputs, logger } = await setup();
  const save = createProjectOutputSaver({
    addGeneratedProjectFile: async () => {
      throw new Error('secret token and submitted content');
    },
    logger,
  });
  expect(await save(req, outputs[0])).toEqual({
    projectId: req.chatProjectContext!.projectId,
    status: 'failed',
    code: 'project_file_save_failed',
  });
  expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { type: 'Error' });
  expect(req.chatProjectContext?.file_ids).toEqual([]);
  expect(await mongoose.models.File.exists({ file_id: outputs[0].file_id })).not.toBeNull();
});

it('does not accept a concurrent project edit into the running approval context', async () => {
  const { req, outputs, methods, save } = await setup();
  await methods.updateChatProject(req.user.id, req.chatProjectContext!.projectId, {
    instructions: 'Changed by user',
  });
  expect(await save(req, outputs[0])).toEqual({
    projectId: req.chatProjectContext!.projectId,
    status: 'failed',
    code: 'project_changed',
  });
  expect(req.chatProjectContext?.contextRevision).toBe(0);
  expect(req.chatProjectContext?.file_ids).toEqual([]);
});
