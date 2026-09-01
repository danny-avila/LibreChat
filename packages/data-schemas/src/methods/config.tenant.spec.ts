import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalType, PrincipalModel } from 'librechat-data-provider';
import { tenantStorage } from '~/config/tenantContext';
import { createConfigModel } from '~/models/config';
import { createConfigMethods } from './config';

const TENANT_A = 'tenant-aaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'tenant-bbbbbbbbbbbbbbbbbbbb';

let mongoServer: MongoMemoryServer;
let methods: ReturnType<typeof createConfigMethods>;

function runAs<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createConfigModel(mongoose);
  methods = createConfigMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.models.Config.deleteMany({});
});

describe('findConfigByPrincipal tenant isolation', () => {
  it('returns only configs for the active tenant context when tenantId is omitted', async () => {
    await runAs(TENANT_A, async () => {
      await methods.upsertConfig(
        PrincipalType.ROLE,
        'admin',
        PrincipalModel.ROLE,
        { cache: true },
        10,
      );
    });
    await runAs(TENANT_B, async () => {
      await methods.upsertConfig(
        PrincipalType.ROLE,
        'admin',
        PrincipalModel.ROLE,
        { cache: false },
        20,
      );
    });

    const tenantAConfig = await runAs(TENANT_A, () =>
      methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin'),
    );
    expect(tenantAConfig?.overrides).toEqual({ cache: true });

    const tenantBConfig = await runAs(TENANT_B, () =>
      methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin'),
    );
    expect(tenantBConfig?.overrides).toEqual({ cache: false });
  });

  it('does not cross-match when explicit legacy tenantId filter contradicts plugin context', async () => {
    await runAs(TENANT_A, async () => {
      await methods.upsertConfig(
        PrincipalType.ROLE,
        'admin',
        PrincipalModel.ROLE,
        { cache: true },
        10,
      );
    });

    const withoutContext = await methods.findConfigByPrincipal(PrincipalType.ROLE, 'admin', {
      tenantId: '',
    });
    expect(withoutContext).toBeNull();
  });
});
