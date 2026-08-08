import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { EToolResources } from 'librechat-data-provider';
import type { IAgent } from '..';
import { createAgentMethods, type AgentMethods } from './agent';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let Agent: mongoose.Model<IAgent>;
let modelsToCleanup: string[] = [];
let methods: AgentMethods;

const getActions = jest.fn().mockResolvedValue([]);

const createAgentWithResources = (
  toolResources: Record<string, { file_ids: string[] }>,
): Promise<IAgent> =>
  Agent.create({
    id: `agent_${uuidv4()}`,
    name: 'Test Agent',
    provider: 'test',
    model: 'test-model',
    author: new mongoose.Types.ObjectId(),
    tool_resources: toolResources,
  }) as unknown as Promise<IAgent>;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  const { createModels } = await import('~/models');
  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  Agent = mongoose.models.Agent as mongoose.Model<IAgent>;

  methods = createAgentMethods(mongoose, {
    removeAllPermissions: jest.fn().mockResolvedValue(undefined),
    getActions,
    getSoleOwnedResourceIds: jest.fn().mockResolvedValue([]),
  });

  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Agent.deleteMany({});
  jest.clearAllMocks();
});

describe('findAgentFileIds', () => {
  it('returns file ids attached to an agent tool_resource', async () => {
    await createAgentWithResources({
      [EToolResources.file_search]: { file_ids: ['fileA', 'fileB'] },
    });

    const result = await methods.findAgentFileIds({ fileIds: ['fileA', 'fileC'] });

    expect(result).toEqual(['fileA']);
  });

  it('detects file ids across multiple tool_resource keys', async () => {
    await createAgentWithResources({
      [EToolResources.file_search]: { file_ids: ['fileA'] },
      [EToolResources.context]: { file_ids: ['fileB'] },
      [EToolResources.ocr]: { file_ids: ['fileC'] },
    });

    const result = await methods.findAgentFileIds({ fileIds: ['fileA', 'fileB', 'fileC'] });

    expect(result.sort()).toEqual(['fileA', 'fileB', 'fileC']);
  });

  it('returns empty array when fileIds is empty', async () => {
    await createAgentWithResources({
      [EToolResources.file_search]: { file_ids: ['fileA'] },
    });

    const result = await methods.findAgentFileIds({ fileIds: [] });

    expect(result).toEqual([]);
  });

  it('returns empty array when no agent references the files', async () => {
    await createAgentWithResources({
      [EToolResources.file_search]: { file_ids: ['fileZ'] },
    });

    const result = await methods.findAgentFileIds({ fileIds: ['fileA', 'fileB'] });

    expect(result).toEqual([]);
  });

  it('deduplicates a file id referenced by multiple agents', async () => {
    await createAgentWithResources({
      [EToolResources.file_search]: { file_ids: ['fileA'] },
    });
    await createAgentWithResources({
      [EToolResources.context]: { file_ids: ['fileA'] },
    });

    const result = await methods.findAgentFileIds({ fileIds: ['fileA'] });

    expect(result).toEqual(['fileA']);
  });
});
