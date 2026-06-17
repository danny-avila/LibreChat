import mongoose from 'mongoose';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { tenantStorage, runAsSystem } from '~/config/tenantContext';
import { createModels } from '../models';
import { createConfigMethods } from './config';

jest.mock('~/config/winston', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createConfigMethods>;
let modelsToCleanup: string[] = [];

const LEGACY_TENANT_ID = '6a271af2439e880203bec1b5';
const TENANT_PRINCIPAL_ID = '6a271af2439e880203bec1b6';

beforeAll(async () => {
  process.env.TENANT_ISOLATION_STRICT = 'true';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  methods = createConfigMethods(mongoose);
});

beforeEach(async () => {
  await runAsSystem(async () => {
    await mongoose.models.Config.deleteMany({});
  });
});

afterAll(async () => {
  delete process.env.TENANT_ISOLATION_STRICT;
  await mongoose.disconnect();
  await mongoServer.stop();
  for (const modelName of modelsToCleanup) {
    if (mongoose.models[modelName]) {
      delete mongoose.models[modelName];
    }
  }
});

describe('getApplicableConfigs with tenant isolation', () => {
  it('finds tenant overrides without tenantId when ALS uses legacy users.tenantId', async () => {
    await runAsSystem(async () => {
      await methods.upsertConfig(
        PrincipalType.TENANT,
        TENANT_PRINCIPAL_ID,
        PrincipalModel.TENANT,
        { interface: { skills: false, prompts: false } },
        5,
      );
    });

    const configs = await tenantStorage.run({ tenantId: LEGACY_TENANT_ID }, async () =>
      methods.getApplicableConfigs([
        { principalType: PrincipalType.TENANT, principalId: TENANT_PRINCIPAL_ID },
      ]),
    );

    expect(configs).toHaveLength(1);
    const overrides = configs[0]?.overrides as {
      interface?: { skills?: boolean; prompts?: boolean };
    };
    expect(overrides.interface?.skills).toBe(false);
    expect(overrides.interface?.prompts).toBe(false);
  });
});
