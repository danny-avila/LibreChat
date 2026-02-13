const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('@librechat/data-schemas', () => {
  const actual = jest.requireActual('@librechat/data-schemas');
  return {
    ...actual,
    logger: {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    },
  };
});

jest.mock('~/models', () => ({
  deleteAllUserSessions: jest.fn().mockResolvedValue(undefined),
  deleteAllSharedLinks: jest.fn().mockResolvedValue(undefined),
  updateUserPlugins: jest.fn(),
  deleteUserById: jest.fn().mockResolvedValue(undefined),
  deleteMessages: jest.fn().mockResolvedValue(undefined),
  deletePresets: jest.fn().mockResolvedValue(undefined),
  deleteUserKey: jest.fn().mockResolvedValue(undefined),
  deleteConvos: jest.fn().mockResolvedValue(undefined),
  deleteFiles: jest.fn().mockResolvedValue(undefined),
  updateUser: jest.fn(),
  findToken: jest.fn(),
  getFiles: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/server/services/PluginService', () => ({
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/server/services/AuthService', () => ({
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
}));

jest.mock('~/server/services/Files/S3/crud', () => ({
  needsRefresh: jest.fn(),
  getNewS3URL: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({}),
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getMCPServersRegistry: jest.fn(),
}));

jest.mock('~/models/ToolCall', () => ({
  deleteToolCalls: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/models/Prompt', () => ({
  deleteUserPrompts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/models/Agent', () => ({
  deleteUserAgents: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

const { deleteUserController } = require('./UserController');
const { Group } = require('~/db/models');
const { deleteConvos } = require('~/models');

describe('deleteUserController', () => {
  const mockRes = {
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 on successful deletion', async () => {
    const userId = new mongoose.Types.ObjectId();
    const req = { user: { id: userId.toString(), _id: userId, email: 'test@test.com' } };

    await deleteUserController(req, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({ message: 'User deleted' });
  });

  it('should remove the user from all groups via $pullAll', async () => {
    const userId = new mongoose.Types.ObjectId();
    const userIdStr = userId.toString();
    const otherUser = new mongoose.Types.ObjectId().toString();

    await Group.create([
      { name: 'Group A', memberIds: [userIdStr, otherUser], source: 'local' },
      { name: 'Group B', memberIds: [userIdStr], source: 'local' },
      { name: 'Group C', memberIds: [otherUser], source: 'local' },
    ]);

    const req = { user: { id: userIdStr, _id: userId, email: 'del@test.com' } };
    await deleteUserController(req, mockRes);

    const groups = await Group.find({}).sort({ name: 1 }).lean();
    expect(groups[0].memberIds).toEqual([otherUser]);
    expect(groups[1].memberIds).toEqual([]);
    expect(groups[2].memberIds).toEqual([otherUser]);
  });

  it('should handle user that exists in no groups', async () => {
    const userId = new mongoose.Types.ObjectId();
    await Group.create({ name: 'Empty', memberIds: ['someone-else'], source: 'local' });

    const req = { user: { id: userId.toString(), _id: userId, email: 'no-groups@test.com' } };
    await deleteUserController(req, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    const group = await Group.findOne({ name: 'Empty' }).lean();
    expect(group.memberIds).toEqual(['someone-else']);
  });

  it('should remove duplicate memberIds if the user appears more than once', async () => {
    const userId = new mongoose.Types.ObjectId();
    const userIdStr = userId.toString();

    await Group.create({
      name: 'Dupes',
      memberIds: [userIdStr, 'other', userIdStr],
      source: 'local',
    });

    const req = { user: { id: userIdStr, _id: userId, email: 'dupe@test.com' } };
    await deleteUserController(req, mockRes);

    const group = await Group.findOne({ name: 'Dupes' }).lean();
    expect(group.memberIds).toEqual(['other']);
  });

  it('should still succeed when deleteConvos throws', async () => {
    const userId = new mongoose.Types.ObjectId();
    deleteConvos.mockRejectedValueOnce(new Error('no convos'));

    const req = { user: { id: userId.toString(), _id: userId, email: 'convos@test.com' } };
    await deleteUserController(req, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.send).toHaveBeenCalledWith({ message: 'User deleted' });
  });

  it('should return 500 when a critical operation fails', async () => {
    const userId = new mongoose.Types.ObjectId();
    const { deleteMessages } = require('~/models');
    deleteMessages.mockRejectedValueOnce(new Error('db down'));

    const req = { user: { id: userId.toString(), _id: userId, email: 'fail@test.com' } };
    await deleteUserController(req, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ message: 'Something went wrong.' });
  });

  it('should use string user.id (not ObjectId user._id) for memberIds removal', async () => {
    const userId = new mongoose.Types.ObjectId();
    const userIdStr = userId.toString();
    const otherUser = 'other-user-id';

    await Group.create({
      name: 'StringCheck',
      memberIds: [userIdStr, otherUser],
      source: 'local',
    });

    const req = { user: { id: userIdStr, _id: userId, email: 'stringcheck@test.com' } };
    await deleteUserController(req, mockRes);

    const group = await Group.findOne({ name: 'StringCheck' }).lean();
    expect(group.memberIds).toEqual([otherUser]);
    expect(group.memberIds).not.toContain(userIdStr);
  });
});
