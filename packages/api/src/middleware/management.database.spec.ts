import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels, getTenantId, tenantStorage } from '@librechat/data-schemas';
import type { AllMethods, AppConfig, IUser } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import { createAgentManagementAuth } from './management';

const CLIENT_ID = 'machine-client';
const TENANT_ID = 'tenant-a';
const OTHER_TENANT_ID = 'tenant-b';

let mongoServer: MongoMemoryServer | undefined;
let methods: AllMethods;
let User: mongoose.Model<IUser>;
let originalStrictMode: string | undefined;

function createConfig(userId: string, tenantId: string): AppConfig {
  return {
    endpoints: {
      agents: {
        managementApi: {
          auth: {
            oidc: {
              enabled: true,
              issuer: 'https://issuer.example.com',
              audience: 'https://agents.example.com',
            },
            clients: [{ clientId: CLIENT_ID, userId, tenantId, enabled: true }],
          },
        },
      },
    },
  } as AppConfig;
}

function createRequest(): Request {
  return { headers: { authorization: 'Bearer signed-access-token' } } as Request;
}

function createResponse(): Response {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as Response;
}

beforeAll(async () => {
  originalStrictMode = process.env.TENANT_ISOLATION_STRICT;
  process.env.TENANT_ISOLATION_STRICT = 'true';
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
  User = mongoose.models.User as mongoose.Model<IUser>;
});

afterAll(async () => {
  if (originalStrictMode == null) {
    delete process.env.TENANT_ISOLATION_STRICT;
  } else {
    process.env.TENANT_ISOLATION_STRICT = originalStrictMode;
  }
  await mongoose.disconnect();
  await mongoServer?.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

describe('Agent Management principal resolution with tenant isolation', () => {
  it('loads a bound User only from the configured tenant', async () => {
    const user = await tenantStorage.run({ tenantId: TENANT_ID }, () =>
      User.create({
        email: 'integration@example.com',
        name: 'Integration',
        username: 'integration',
        provider: 'local',
        role: 'USER',
        tenantId: TENANT_ID,
      }),
    );
    const userId = user._id.toString();
    const verifyAccessToken = jest.fn().mockResolvedValue({
      sub: `${CLIENT_ID}@clients`,
      azp: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    let downstreamTenant: string | undefined;
    const validRequest = createRequest();
    const validResponse = createResponse();
    const validAuth = createAgentManagementAuth({
      findUser: methods.findUser,
      getAppConfig: jest.fn().mockResolvedValue(createConfig(userId, TENANT_ID)),
      verifyAccessToken,
    });

    const userLookup = jest.spyOn(User, 'findOne');
    const userExists = jest.spyOn(User, 'exists');
    await validAuth(validRequest, validResponse, () => {
      downstreamTenant = getTenantId();
    });

    expect(userLookup).toHaveBeenCalledTimes(1);
    expect(userExists).not.toHaveBeenCalled();
    userLookup.mockRestore();
    userExists.mockRestore();
    expect(downstreamTenant).toBe(TENANT_ID);
    expect((validRequest as Request & { user?: IUser }).user).toMatchObject({
      id: userId,
      tenantId: TENANT_ID,
    });
    expect(validResponse.status).not.toHaveBeenCalled();

    for (const fence of [new Date(), null]) {
      await tenantStorage.run(
        { tenantId: TENANT_ID },
        async () =>
          await User.updateOne({ _id: userId }, { $set: { agentTriggerDeletionStartedAt: fence } }),
      );
      const fencedResponse = createResponse();
      const fencedNext = jest.fn();
      const fencedRequest = createRequest();
      await validAuth(fencedRequest, fencedResponse, fencedNext);
      expect(fencedResponse.status).toHaveBeenCalledWith(409);
      expect(fencedNext).not.toHaveBeenCalled();
      expect(fencedRequest).not.toHaveProperty('user');
    }
    await tenantStorage.run(
      { tenantId: TENANT_ID },
      async () =>
        await User.updateOne({ _id: userId }, { $unset: { agentTriggerDeletionStartedAt: 1 } }),
    );
    const recoveredNext = jest.fn();
    await validAuth(createRequest(), createResponse(), recoveredNext);
    expect(recoveredNext).toHaveBeenCalledTimes(1);

    const crossTenantResponse = createResponse();
    const crossTenantNext = jest.fn();
    const crossTenantAuth = createAgentManagementAuth({
      findUser: methods.findUser,
      getAppConfig: jest.fn().mockResolvedValue(createConfig(userId, OTHER_TENANT_ID)),
      verifyAccessToken,
    });

    await crossTenantAuth(createRequest(), crossTenantResponse, crossTenantNext);

    expect(crossTenantResponse.status).toHaveBeenCalledWith(401);
    expect(crossTenantNext).not.toHaveBeenCalled();
  });
});
