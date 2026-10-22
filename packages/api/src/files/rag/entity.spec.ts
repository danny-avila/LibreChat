import mongoose from 'mongoose';
import { FileContext } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { TGetFileSearchAgents, EntityFile } from './entity';
import type { THasEntityEmbeddings } from '~/agents/resources';
import { createEntityResolver } from './entity';

let mongo: MongoMemoryServer;
let methods: ReturnType<typeof createMethods>;
let getAgents: jest.Mock<ReturnType<TGetFileSearchAgents>, Parameters<TGetFileSearchAgents>>;
const userId = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all(['Agent', 'File'].map((name) => mongoose.models[name].deleteMany({})));
  getAgents = jest.fn((filter, select) => methods.getAgents(filter, select));
});

async function createAgent(id: string, fileIds: string[]): Promise<void> {
  await mongoose.models.Agent.create({
    id,
    name: id,
    provider: 'openAI',
    model: 'gpt-4o',
    author: userId,
    tool_resources: { file_search: { file_ids: fileIds } },
  });
}

async function createFile(
  file_id: string,
  context: FileContext,
  embeddedEntities?: string[],
): Promise<EntityFile> {
  await mongoose.models.File.create({
    user: userId,
    file_id,
    bytes: 10,
    filename: `${file_id}.pdf`,
    filepath: `/uploads/${file_id}.pdf`,
    object: 'file',
    type: 'application/pdf',
    embedded: true,
    context,
    ...(embeddedEntities ? { metadata: { embeddedEntities } } : {}),
  });
  const file = await mongoose.models.File.findOne({ file_id }).lean<EntityFile>();
  if (!file) {
    throw new Error(`File ${file_id} was not stored`);
  }
  return file;
}

/** Answers like rag-api: true only when the entity owns chunks of the file. */
function ownedBy(owners: Record<string, string[]>): jest.MockedFunction<THasEntityEmbeddings> {
  return jest.fn(async ({ file_id, entity_id }) => owners[file_id]?.includes(entity_id) ?? false);
}

describe('createEntityResolver', () => {
  it('resolves the agent recorded on the file', async () => {
    const file = await createFile('f1', FileContext.agents, ['agent_a']);
    const resolve = createEntityResolver({ userId, getAgents });
    expect(await resolve(file)).toBe('agent_a');
    expect(getAgents).not.toHaveBeenCalled();
  });

  it('sends the agent and never the user when both namespaces are recorded', async () => {
    const file = await createFile('f1', FileContext.agents, [userId, 'agent_a']);
    expect(userId < 'agent_a').toBe(true);
    const hasEntityEmbeddings = ownedBy({ f1: ['agent_a', userId] });
    const resolve = createEntityResolver({ userId, getAgents, hasEntityEmbeddings });
    expect(await resolve(file)).toBe('agent_a');
    expect(hasEntityEmbeddings).not.toHaveBeenCalled();
  });

  it('resolves nothing when only the user namespace is recorded', async () => {
    const file = await createFile('f1', FileContext.agents, [userId]);
    await createAgent('agent_a', ['f1']);
    const resolve = createEntityResolver({ userId, getAgents });
    expect(await resolve(file)).toBeUndefined();
    expect(getAgents).not.toHaveBeenCalled();
  });

  it('looks up the listing agent for a legacy file without probing', async () => {
    const file = await createFile('f1', FileContext.agents);
    await createAgent('agent_a', ['f1']);
    const hasEntityEmbeddings = ownedBy({ f1: ['agent_a'] });
    const resolve = createEntityResolver({ userId, getAgents, hasEntityEmbeddings });
    expect(await resolve(file)).toBe('agent_a');
    expect(hasEntityEmbeddings).not.toHaveBeenCalled();
  });

  it('resolves nothing for a legacy file no agent lists', async () => {
    const file = await createFile('f1', FileContext.agents);
    await createAgent('agent_a', ['other']);
    const resolve = createEntityResolver({ userId, getAgents });
    expect(await resolve(file)).toBeUndefined();
  });

  it('picks the listing agent that holds the vectors, not the lowest id', async () => {
    const file = await createFile('f1', FileContext.agents);
    await createAgent('agent_a', ['f1']);
    await createAgent('agent_b', ['f1']);
    const hasEntityEmbeddings = ownedBy({ f1: ['agent_b'] });
    const resolve = createEntityResolver({ userId, getAgents, hasEntityEmbeddings });
    expect(await resolve(file)).toBe('agent_b');
    expect(hasEntityEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ userId, file_id: 'f1', query: 'f1.pdf' }),
    );
  });

  it('picks the recorded agent that holds the vectors', async () => {
    const file = await createFile('f1', FileContext.agents, ['agent_b', 'agent_a']);
    const hasEntityEmbeddings = ownedBy({ f1: ['agent_b'] });
    const resolve = createEntityResolver({ userId, getAgents, hasEntityEmbeddings });
    expect(await resolve(file)).toBe('agent_b');
  });

  it('falls back to the lowest candidate when the probe rejects', async () => {
    const file = await createFile('f1', FileContext.agents, ['agent_b', 'agent_a']);
    const hasEntityEmbeddings = jest.fn(async () => {
      throw new Error('RAG unavailable');
    });
    const resolve = createEntityResolver({ userId, getAgents, hasEntityEmbeddings });
    expect(await resolve(file)).toBe('agent_a');
  });

  it('resolves nothing for a file outside the agents context', async () => {
    const file = await createFile('f1', FileContext.message_attachment);
    await createAgent('agent_a', ['f1']);
    const resolve = createEntityResolver({ userId, getAgents });
    expect(await resolve(file)).toBeUndefined();
    expect(getAgents).not.toHaveBeenCalled();
  });

  it('looks up every legacy file of a turn in one query', async () => {
    const first = await createFile('f1', FileContext.agents);
    const second = await createFile('f2', FileContext.agents);
    await createAgent('agent_a', ['f1']);
    await createAgent('agent_b', ['f2']);
    const resolve = createEntityResolver({ userId, getAgents });
    expect(await Promise.all([resolve(first), resolve(second)])).toEqual(['agent_a', 'agent_b']);
    expect(getAgents).toHaveBeenCalledTimes(1);
  });
});
