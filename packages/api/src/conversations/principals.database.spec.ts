import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import express, { type RequestHandler, type Response } from 'express';
import { EModelEndpoint, PermissionTypes, Permissions } from 'librechat-data-provider';
import {
  createMethods,
  createModels,
  tenantStorage,
  type AllMethods,
  type AppConfig,
  type IConversation,
  type IUser,
} from '@librechat/data-schemas';
import type { JwtPayload } from 'jsonwebtoken';
import type { ServerRequest } from '~/types';
import { createConversationManagementAuth, type ConversationManagementAuthDeps } from './auth';
import { createRequireApiKeyAuth, type ApiKeyAuthRequest } from '../apiKeys/middleware';
import { createRemoteAgentAuth } from '../middleware/remoteAgentAuth';
import { createAgentManagementAuth } from '../middleware/management';
import { createConversationManagementHandlers } from './management';
import { generateCheckAccess } from '../middleware/access';
import * as oidc from '../auth/oidc';

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  };
});

const TENANT_A = 'tenant-aaaaaaaaaaaaaaaaaaaa';
const TENANT_B = 'tenant-bbbbbbbbbbbbbbbbbbbb';
const MACHINE_CLIENT = 'conversation-machine';

let mongoServer: MongoMemoryServer;
let methods: AllMethods;
let User: mongoose.Model<IUser>;
let Conversation: mongoose.Model<IConversation>;
let userA: IUser;
let userB: IUser;

function asTenant<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

type RemoteAuthOptions = {
  apiKeyEnabled?: boolean;
  oidcEnabled?: boolean;
};

function apiConfig(
  mode: 'remote' | 'management',
  remoteAuthOptions: RemoteAuthOptions = {},
): AppConfig {
  const { apiKeyEnabled = true, oidcEnabled = false } = remoteAuthOptions;

  return {
    endpoints: {
      agents: {
        conversationApi: { auth: mode },
        remoteApi: {
          auth: {
            apiKey: { enabled: apiKeyEnabled },
            ...(oidcEnabled
              ? {
                  oidc: {
                    enabled: true,
                    issuer: 'https://issuer.example',
                    audience: 'conversation-api',
                  },
                }
              : {}),
          },
        },
        managementApi: {
          auth: {
            oidc: { enabled: true, issuer: 'https://issuer.example', audience: 'conversation-api' },
            clients: [
              {
                clientId: MACHINE_CLIENT,
                userId: userA._id.toString(),
                tenantId: TENANT_A,
                enabled: true,
              },
            ],
          },
        },
      },
    },
  } as AppConfig;
}

function expressHandler(
  handler: (req: ServerRequest, res: Response) => Promise<Response>,
): RequestHandler {
  return async (req, res) => {
    await handler(req as ServerRequest, res);
  };
}

function createApp(
  mode: 'remote' | 'management',
  verifyMachine?: (token: string, config: { issuer: string; audience: string }) => Promise<object>,
  remoteAuthOptions?: RemoteAuthOptions,
): express.Express {
  const getAppConfig = jest.fn().mockResolvedValue(apiConfig(mode, remoteAuthOptions));
  const apiKeyAuthHandler = createRequireApiKeyAuth({
    validateAgentApiKey: methods.validateAgentApiKey,
    findUser: methods.findUser,
    isPrincipalActive: methods.isAgentTriggerPrincipalActive,
  });
  const apiKeyAuth: RequestHandler = async (req, res, next) => {
    await apiKeyAuthHandler(req as ApiKeyAuthRequest, res, next);
  };
  const remoteAuth = (getConfig: ConversationManagementAuthDeps['getAppConfig']) =>
    createRemoteAgentAuth({
      apiKeyMiddleware: apiKeyAuth,
      findUser: methods.findUser,
      getRolesByNames: methods.findRolesByNames,
      updateUser: methods.updateUser,
      isPrincipalActive: methods.isAgentTriggerPrincipalActive,
      getAppConfig: getConfig,
    });
  const managementAuth = (getConfig: ConversationManagementAuthDeps['getAppConfig']) =>
    createAgentManagementAuth({
      findUser: methods.findUser,
      getAppConfig: getConfig,
      ...(verifyMachine == null
        ? {}
        : {
            verifyAccessToken: async (token, config) =>
              verifyMachine(token, config) as Promise<JwtPayload>,
          }),
    });
  const remoteAccess = generateCheckAccess({
    permissionType: PermissionTypes.REMOTE_AGENTS,
    permissions: [Permissions.USE],
    getRoleByName: methods.getRoleByName,
  });
  const auth = createConversationManagementAuth({
    getAppConfig,
    remoteAuth,
    managementAuth,
    remoteAccess: async (req, res, next) => {
      await remoteAccess(req, res, next);
    },
  });
  const handlers = createConversationManagementHandlers({
    initializeAssistantClient: async () => {
      throw new Error('Provider client is not exercised');
    },
    canRecoverAgentConversationDeletion: async () => false,
    getConversationResourceDeletionState: methods.getConversationResourceDeletionState,
    getConversationResource: methods.getConversationResource,
    getConversationProviderThreadIds: methods.getConversationProviderThreadIds,
    listConversationResources: methods.listConversationResources,
    listConversationMessageResources: methods.listConversationMessageResources,
    saveConvo: methods.saveConvo,
    updateConversationResourceTags: methods.updateConversationResourceTags,
    deleteConversations: async () => {
      throw new Error('delete service is not exercised by principal composition');
    },
  });
  const app = express();
  app.use(auth);
  app.get('/:id', expressHandler(handlers.get));
  return app;
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  methods = createMethods(mongoose);
  User = mongoose.models.User as mongoose.Model<IUser>;
  Conversation = mongoose.models.Conversation as mongoose.Model<IConversation>;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  jest.restoreAllMocks();
  await mongoose.connection.dropDatabase();
  for (const tenantId of [TENANT_A, TENANT_B]) {
    await asTenant(tenantId, async () => {
      await methods.getRoleByName('USER');
      await mongoose.models.Role.updateOne(
        { name: 'USER' },
        {
          $set: { 'permissions.REMOTE_AGENTS.USE': true },
        },
      );
    });
  }
  userA = await asTenant(TENANT_A, () =>
    User.create({
      email: 'a@example.com',
      name: 'A',
      username: 'a',
      provider: 'local',
      role: 'USER',
    }),
  );
  userB = await asTenant(TENANT_B, () =>
    User.create({
      email: 'b@example.com',
      name: 'B',
      username: 'b',
      provider: 'local',
      role: 'USER',
    }),
  );
  await Promise.all([
    asTenant(TENANT_A, () =>
      Conversation.create({
        conversationId: 'a-history',
        user: userA._id.toString(),
        title: 'A history',
        endpoint: EModelEndpoint.openAI,
      }),
    ),
    asTenant(TENANT_B, () =>
      Conversation.create({
        conversationId: 'b-history',
        user: userB._id.toString(),
        title: 'B history',
        endpoint: EModelEndpoint.openAI,
      }),
    ),
  ]);
});

describe('conversation API principal composition', () => {
  it('admits a real API-key principal to only its own tenant history and rejects a revoked key', async () => {
    const key = await asTenant(TENANT_A, () =>
      methods.createAgentApiKey({ userId: userA._id, name: 'history key' }),
    );
    const app = createApp('remote');

    const own = await request(app).get('/a-history').set('Authorization', `Bearer ${key.key}`);
    const other = await request(app).get('/b-history').set('Authorization', `Bearer ${key.key}`);
    await asTenant(TENANT_A, () => methods.deleteAgentApiKey(key.id, userA._id));
    const revoked = await request(app).get('/a-history').set('Authorization', `Bearer ${key.key}`);

    expect(own.status).toBe(200);
    expect(own.body.title).toBe('A history');
    expect(other.status).toBe(404);
    expect(revoked.status).toBe(401);
  });

  it('rejects an existing API key immediately after its role grant is revoked', async () => {
    const key = await asTenant(TENANT_A, () =>
      methods.createAgentApiKey({ userId: userA._id, name: 'role-revocation' }),
    );
    const app = createApp('remote');
    expect(
      (await request(app).get('/a-history').set('Authorization', `Bearer ${key.key}`)).status,
    ).toBe(200);
    await asTenant(TENANT_A, () =>
      mongoose.models.Role.updateOne(
        { name: 'USER' },
        {
          $set: { 'permissions.REMOTE_AGENTS.USE': false },
        },
      ),
    );
    expect(
      (await request(app).get('/a-history').set('Authorization', `Bearer ${key.key}`)).status,
    ).toBe(403);
  });

  it('binds a machine token to exactly its configured user and tenant without remote fallback', async () => {
    const verifyMachine = jest.fn(async (token: string) => {
      if (token !== 'machine-token') throw new Error('Invalid machine token');
      return {
        sub: `${MACHINE_CLIENT}@clients`,
        azp: MACHINE_CLIENT,
        exp: Math.floor(Date.now() / 1000) + 60,
      };
    });
    const app = createApp('management', verifyMachine);

    const own = await request(app).get('/a-history').set('Authorization', 'Bearer machine-token');
    const other = await request(app).get('/b-history').set('Authorization', 'Bearer machine-token');
    const key = await asTenant(TENANT_A, () =>
      methods.createAgentApiKey({ userId: userA._id, name: 'fallback key' }),
    );
    const apiKey = await request(app).get('/a-history').set('Authorization', `Bearer ${key.key}`);

    expect(own.status).toBe(200);
    expect(other.status).toBe(404);
    expect(apiKey.status).toBe(401);
    expect(verifyMachine).toHaveBeenCalledWith(
      'machine-token',
      expect.objectContaining({ issuer: 'https://issuer.example', audience: 'conversation-api' }),
    );
  });

  it('rejects unknown or disabled machine bindings and inactive bound principals', async () => {
    const unknown = createApp('management', async () => ({
      sub: 'unknown@clients',
      azp: 'unknown',
      exp: Math.floor(Date.now() / 1000) + 60,
    }));
    const inactive = createApp('management', async () => ({
      sub: `${MACHINE_CLIENT}@clients`,
      azp: MACHINE_CLIENT,
      exp: Math.floor(Date.now() / 1000) + 60,
    }));
    await methods.beginAgentTriggerUserDeletion(userA._id.toString(), new Date());

    expect(
      (await request(unknown).get('/a-history').set('Authorization', 'Bearer token')).status,
    ).toBe(401);
    expect(
      (await request(inactive).get('/a-history').set('Authorization', 'Bearer token')).status,
    ).toBe(409);
  });

  it('rejects a controlled OIDC issuer or audience verification failure', async () => {
    const app = createApp('management', async () => {
      throw new Error('issuer or audience rejected');
    });

    const response = await request(app).get('/a-history').set('Authorization', 'Bearer bad-oidc');

    expect(response.status).toBe(401);
  });

  it('resolves a remote OIDC user from Mongo and limits history to that user tenant', async () => {
    await asTenant(TENANT_A, () =>
      User.updateOne({ _id: userA._id }, { $set: { provider: 'openid' } }).exec(),
    );
    const verifyOidcAccessToken = jest.spyOn(oidc, 'verifyOidcAccessToken').mockResolvedValue({
      sub: 'oidc-user-a',
      email: 'a@example.com',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const app = createApp('remote', undefined, { apiKeyEnabled: false, oidcEnabled: true });

    const own = await request(app)
      .get('/a-history')
      .set('Authorization', 'Bearer remote-user-token');
    const other = await request(app)
      .get('/b-history')
      .set('Authorization', 'Bearer remote-user-token');

    expect(own.status).toBe(200);
    expect(own.body.title).toBe('A history');
    expect(other.status).toBe(404);
    expect(verifyOidcAccessToken).toHaveBeenCalledWith(
      'remote-user-token',
      expect.objectContaining({ issuer: 'https://issuer.example', audience: 'conversation-api' }),
      { useOpenIdJwksEnv: true },
    );
    await expect(User.findById(userA._id).lean()).resolves.toMatchObject({
      openidId: 'oidc-user-a',
      openidIssuer: 'https://issuer.example',
    });
    await asTenant(TENANT_A, () =>
      mongoose.models.Role.updateOne(
        { name: 'USER' },
        {
          $set: { 'permissions.REMOTE_AGENTS.USE': false },
        },
      ),
    );
    expect(
      (await request(app).get('/a-history').set('Authorization', 'Bearer remote-user-token'))
        .status,
    ).toBe(403);
  });

  it('rejects invalid OIDC claims or verification without API-key fallback when disabled', async () => {
    const app = createApp('remote', undefined, { apiKeyEnabled: false, oidcEnabled: true });
    const key = await asTenant(TENANT_A, () =>
      methods.createAgentApiKey({ userId: userA._id, name: 'disabled fallback key' }),
    );
    const verifyOidcAccessToken = jest.spyOn(oidc, 'verifyOidcAccessToken');
    verifyOidcAccessToken.mockRejectedValueOnce(new Error('issuer or audience rejected'));
    verifyOidcAccessToken.mockResolvedValueOnce({
      email: 'a@example.com',
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const rejectedIssuerOrAudience = await request(app)
      .get('/a-history')
      .set('Authorization', `Bearer ${key.key}`);
    const rejectedSubject = await request(app)
      .get('/a-history')
      .set('Authorization', 'Bearer no-subject-token');

    expect(rejectedIssuerOrAudience.status).toBe(401);
    expect(rejectedSubject.status).toBe(401);
  });
});
