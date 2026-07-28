const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { SystemCapabilities } = require('@librechat/data-schemas');
const {
  SystemRoles,
  ResourceType,
  AccessRoleIds,
  PrincipalType,
} = require('librechat-data-provider');

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  getTransactionSupport: jest.fn().mockResolvedValue(false),
}));

jest.mock('~/server/services/GraphApiService', () => ({
  entraIdPrincipalFeatureEnabled: jest.fn().mockReturnValue(false),
  getUserOwnedEntraGroups: jest.fn().mockResolvedValue([]),
  getUserEntraGroups: jest.fn().mockResolvedValue([]),
  getEntraGroupDetailsBatch: jest.fn().mockResolvedValue([]),
  getGroupMembers: jest.fn().mockResolvedValue([]),
  getGroupOwners: jest.fn().mockResolvedValue([]),
}));

const mockRegistryInstance = {
  getServerConfig: jest.fn(),
};

jest.mock('~/config', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  getMCPManager: jest.fn(),
  getMCPServersRegistry: jest.fn(() => mockRegistryInstance),
}));

const mockResolveAllMcpConfigs = jest.fn();
jest.mock('~/server/services/MCP', () => ({
  resolveConfigServers: jest.fn().mockResolvedValue({}),
  resolveMcpConfigNames: jest.fn().mockResolvedValue([]),
  resolveAllMcpConfigs: (...args) => mockResolveAllMcpConfigs(...args),
}));

jest.mock('~/server/services/Config', () => ({
  cacheMCPServerTools: jest.fn(),
  getMCPServerTools: jest.fn(),
}));

const { getMCPServersList, getMCPServerById } = require('~/server/controllers/mcp');
const { grantPermission } = require('~/server/services/PermissionService');
const { seedDefaultRoles } = require('~/models');

let mongoServer;
let SystemGrant;
let AclEntry;
let User;

const yamlConfig = {
  type: 'streamable-http',
  url: 'https://internal.example.com/mcp',
  title: 'YAML Server',
  source: 'yaml',
  oauth: {
    client_id: 'client-id',
    authorization_url: 'https://internal.example.com/auth',
    token_url: 'https://internal.example.com/token',
  },
};

const createRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const createDbConfig = (dbId) => ({
  type: 'streamable-http',
  url: 'https://user.example.com/mcp',
  title: 'DB Server',
  source: 'user',
  dbId: String(dbId),
});

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  const { createModels } = jest.requireActual('@librechat/data-schemas');
  createModels(mongoose);
  const dbModels = require('~/db/models');
  Object.assign(mongoose.models, dbModels);
  SystemGrant = dbModels.SystemGrant;
  AclEntry = dbModels.AclEntry;
  User = dbModels.User;

  await seedDefaultRoles();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

let existsSpy;

beforeEach(async () => {
  await SystemGrant.deleteMany({});
  await AclEntry.deleteMany({});
  await User.deleteMany({});
  mockResolveAllMcpConfigs.mockReset();
  mockRegistryInstance.getServerConfig.mockReset();
  existsSpy = jest.spyOn(SystemGrant, 'exists');
});

afterEach(() => {
  existsSpy.mockRestore();
});

const seedManageMcpGrant = async (role = SystemRoles.ADMIN) => {
  await SystemGrant.create({
    principalType: PrincipalType.ROLE,
    principalId: role,
    capability: SystemCapabilities.MANAGE_MCP_SERVERS,
    grantedAt: new Date(),
  });
};

const createUser = async (role = SystemRoles.USER) => {
  const user = await User.create({
    name: 'Test User',
    email: `user-${new mongoose.Types.ObjectId().toString()}@example.com`,
    provider: 'local',
    role,
  });
  return { id: user._id.toString(), role, idOnTheSource: null };
};

describe('getMCPServersList', () => {
  it('skips the capability probe when no server is DB-backed', async () => {
    await seedManageMcpGrant();
    const reqUser = await createUser(SystemRoles.ADMIN);
    mockResolveAllMcpConfigs.mockResolvedValue({ yamlServer: { ...yamlConfig } });

    const res = createRes();
    await getMCPServersList({ user: reqUser }, res);

    expect(existsSpy).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    expect(payload.yamlServer.title).toBe('YAML Server');
    expect(payload.yamlServer.url).toBeUndefined();
    expect(payload.yamlServer.oauth.authorization_url).toBeUndefined();
  });

  it('skips the probe entirely for an empty server map', async () => {
    const reqUser = await createUser();
    mockResolveAllMcpConfigs.mockResolvedValue({});

    const res = createRes();
    await getMCPServersList({ user: reqUser }, res);

    expect(existsSpy).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({});
  });

  it('applies the capability bypass to all servers when a DB-backed server is present', async () => {
    await seedManageMcpGrant();
    const reqUser = await createUser(SystemRoles.ADMIN);
    const dbId = new mongoose.Types.ObjectId();
    mockResolveAllMcpConfigs.mockResolvedValue({
      dbServer: createDbConfig(dbId),
      yamlServer: { ...yamlConfig },
    });

    const res = createRes();
    await getMCPServersList({ user: reqUser }, res);

    expect(existsSpy).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.dbServer.url).toBe('https://user.example.com/mcp');
    expect(payload.yamlServer.url).toBe('https://internal.example.com/mcp');
  });

  it('falls back to ACL EDIT for DB-backed servers without the capability', async () => {
    const reqUser = await createUser();
    const dbId = new mongoose.Types.ObjectId();
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: reqUser.id,
      resourceType: ResourceType.MCPSERVER,
      resourceId: dbId,
      accessRoleId: AccessRoleIds.MCPSERVER_EDITOR,
      grantedBy: reqUser.id,
    });
    mockResolveAllMcpConfigs.mockResolvedValue({
      dbServer: createDbConfig(dbId),
      yamlServer: { ...yamlConfig },
    });

    const res = createRes();
    await getMCPServersList({ user: reqUser }, res);

    expect(existsSpy).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.dbServer.url).toBe('https://user.example.com/mcp');
    expect(payload.yamlServer.url).toBeUndefined();
  });

  it('leaves DB-backed servers redacted for viewer-only ACL', async () => {
    const reqUser = await createUser();
    const dbId = new mongoose.Types.ObjectId();
    await grantPermission({
      principalType: PrincipalType.USER,
      principalId: reqUser.id,
      resourceType: ResourceType.MCPSERVER,
      resourceId: dbId,
      accessRoleId: AccessRoleIds.MCPSERVER_VIEWER,
      grantedBy: reqUser.id,
    });
    mockResolveAllMcpConfigs.mockResolvedValue({ dbServer: createDbConfig(dbId) });

    const res = createRes();
    await getMCPServersList({ user: reqUser }, res);

    expect(existsSpy).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.dbServer.title).toBe('DB Server');
    expect(payload.dbServer.url).toBeUndefined();
  });
});

describe('getMCPServerById', () => {
  it('still runs the capability probe for YAML servers on the detail route', async () => {
    await seedManageMcpGrant();
    const reqUser = await createUser(SystemRoles.ADMIN);
    mockRegistryInstance.getServerConfig.mockResolvedValue({ ...yamlConfig });

    const res = createRes();
    await getMCPServerById({ user: reqUser, params: { serverName: 'yamlServer' } }, res);

    expect(existsSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.url).toBe('https://internal.example.com/mcp');
    expect(payload.oauth.authorization_url).toBe('https://internal.example.com/auth');
  });

  it('redacts YAML server details for users without the capability', async () => {
    const reqUser = await createUser();
    mockRegistryInstance.getServerConfig.mockResolvedValue({ ...yamlConfig });

    const res = createRes();
    await getMCPServerById({ user: reqUser, params: { serverName: 'yamlServer' } }, res);

    expect(existsSpy).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.url).toBeUndefined();
    expect(payload.oauth.authorization_url).toBeUndefined();
  });
});
