const mockGetUserById = jest.fn();
const mockDeleteMessages = jest.fn();
const mockDeleteAllUserSessions = jest.fn();
const mockDeleteUserById = jest.fn();
const mockDeleteAllSharedLinks = jest.fn();
const mockDeleteAllSharedLinksWithCleanup = jest.fn();
const mockDeletePresets = jest.fn();
const mockDeleteUserKey = jest.fn();
const mockDeleteConvos = jest.fn();
const mockDeleteFiles = jest.fn();
const mockGetFiles = jest.fn();
const mockUpdateUserPlugins = jest.fn();
const mockUpdateUser = jest.fn();
const mockFindToken = jest.fn();
const mockVerifyOTPOrBackupCode = jest.fn();
const mockDeleteUserPluginAuth = jest.fn();
const mockProcessDeleteRequest = jest.fn();
const mockDeleteToolCalls = jest.fn();
const mockDeleteUserAgents = jest.fn();
const mockDeleteUserPrompts = jest.fn();
const mockDeleteUserSkills = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
  webSearchKeys: [],
  UNREADABLE_ABORT_FENCE: '__unreadable__',
}));

jest.mock('librechat-data-provider', () => ({
  Tools: {},
  CacheKeys: {},
  Constants: { mcp_delimiter: '::', mcp_prefix: 'mcp_' },
  FileSources: {},
}));

jest.mock('@librechat/api', () => ({
  MCPOAuthHandler: {},
  MCPTokenStorage: {},
  normalizeHttpError: jest.fn(),
  extractWebSearchEnvVars: jest.fn(),
  needsRefresh: jest.fn(),
  getNewS3URL: jest.fn(),
  deleteAgentCheckpoints: jest.fn(async () => undefined),
  registerShutdownTask: jest.fn(),
  GenerationJobManager: {
    getActiveJobIdsForUser: jest.fn(async () => []),
    abortJob: jest.fn(async () => ({ success: true })),
    countUserFinalizations: jest.fn(async () => 0),
    resignalAbort: jest.fn(async () => ({ delivered: false, published: true })),
    getJob: jest.fn(async () => null),
  },
  deleteAllSharedLinksWithCleanup: (...args) => mockDeleteAllSharedLinksWithCleanup(...args),
}));

jest.mock('~/server/services/Schedules', () => ({
  quiesceUserSchedules: jest.fn().mockResolvedValue(true),
}));

jest.mock('~/models', () => ({
  markUserDeleting: jest.fn().mockResolvedValue(new Date()),
  markUserDeletionCommitted: jest.fn().mockResolvedValue(undefined),
  getUsersPendingDeletion: jest.fn().mockResolvedValue([]),
  markDeletionSweepAttempted: jest.fn().mockResolvedValue(undefined),
  deleteAllUserSessions: (...args) => mockDeleteAllUserSessions(...args),
  deleteAllSharedLinks: (...args) => mockDeleteAllSharedLinks(...args),
  updateUserPlugins: (...args) => mockUpdateUserPlugins(...args),
  deleteUserById: (...args) => mockDeleteUserById(...args),
  deleteMessages: (...args) => mockDeleteMessages(...args),
  deletePresets: (...args) => mockDeletePresets(...args),
  deleteUserKey: (...args) => mockDeleteUserKey(...args),
  getUserById: (...args) => mockGetUserById(...args),
  deleteConvos: (...args) => mockDeleteConvos(...args),
  deleteFiles: (...args) => mockDeleteFiles(...args),
  updateUser: (...args) => mockUpdateUser(...args),
  findToken: (...args) => mockFindToken(...args),
  getFiles: (...args) => mockGetFiles(...args),
  deleteToolCalls: (...args) => mockDeleteToolCalls(...args),
  deleteUserAgents: (...args) => mockDeleteUserAgents(...args),
  deleteUserPrompts: (...args) => mockDeleteUserPrompts(...args),
  deleteUserSkills: (...args) => mockDeleteUserSkills(...args),
  deleteSchedulesByUser: jest.fn().mockResolvedValue(undefined),
  addUserAbortFence: jest.fn().mockResolvedValue(undefined),
  clearUserAbortFence: jest.fn().mockResolvedValue(undefined),
  getUserAbortFences: jest.fn().mockResolvedValue([]),
  deleteTransactions: jest.fn(),
  deleteBalances: jest.fn(),
  deleteAllAgentApiKeys: jest.fn(),
  deleteAssistants: jest.fn(),
  deleteConversationTags: jest.fn(),
  deleteAllUserMemories: jest.fn(),
  deleteActions: jest.fn(),
  deleteTokens: jest.fn(),
  removeUserFromAllGroups: jest.fn(),
  deleteAclEntries: jest.fn(),
  getSoleOwnedResourceIds: jest.fn().mockResolvedValue([]),
}));

jest.mock('~/server/services/PluginService', () => ({
  updateUserPluginAuth: jest.fn(),
  deleteUserPluginAuth: (...args) => mockDeleteUserPluginAuth(...args),
}));

jest.mock('~/server/services/twoFactorService', () => ({
  verifyOTPOrBackupCode: (...args) => mockVerifyOTPOrBackupCode(...args),
}));

jest.mock('~/server/services/AuthService', () => ({
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
}));

jest.mock('~/config', () => ({
  getMCPManager: jest.fn(),
  getFlowStateManager: jest.fn(),
  getMCPServersRegistry: jest.fn(),
}));

jest.mock('~/server/services/Config/getCachedTools', () => ({
  invalidateCachedTools: jest.fn(),
}));

jest.mock('~/server/services/Files/process', () => ({
  processDeleteRequest: (...args) => mockProcessDeleteRequest(...args),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

jest.mock('~/cache', () => ({
  getLogStores: jest.fn(),
}));

const { deleteUserController } = require('~/server/controllers/UserController');

function createRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  return res;
}

function stubDeletionMocks() {
  mockDeleteMessages.mockResolvedValue();
  mockDeleteAllUserSessions.mockResolvedValue();
  mockDeleteUserKey.mockResolvedValue();
  mockDeletePresets.mockResolvedValue();
  mockDeleteConvos.mockResolvedValue();
  mockDeleteUserPluginAuth.mockResolvedValue();
  mockDeleteUserById.mockResolvedValue();
  mockDeleteAllSharedLinks.mockResolvedValue();
  mockDeleteAllSharedLinksWithCleanup.mockResolvedValue({ deletedCount: 0 });
  mockGetFiles.mockResolvedValue([]);
  mockProcessDeleteRequest.mockResolvedValue({ deletedFileIds: [], failedFileIds: [] });
  mockDeleteFiles.mockResolvedValue();
  mockDeleteToolCalls.mockResolvedValue();
  mockDeleteUserAgents.mockResolvedValue();
  mockDeleteUserPrompts.mockResolvedValue();
  mockDeleteUserSkills.mockResolvedValue(0);
}

beforeEach(() => {
  jest.clearAllMocks();
  stubDeletionMocks();
});

describe('deleteUserController - 2FA enforcement', () => {
  it('proceeds with deletion when 2FA is not enabled', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });

    await deleteUserController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'User deleted' });
    expect(mockDeleteMessages).toHaveBeenCalled();
    expect(mockDeleteUserAgents).toHaveBeenCalledWith('user1');
    expect(mockDeleteUserPrompts).toHaveBeenCalledWith('user1');
    expect(mockDeleteUserSkills).toHaveBeenCalledWith('user1');
    expect(mockVerifyOTPOrBackupCode).not.toHaveBeenCalled();
  });

  it('proceeds with deletion when user has no 2FA record', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue(null);

    await deleteUserController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'User deleted' });
  });

  it('returns error when 2FA is enabled and verification fails with 400', async () => {
    const req = { user: { id: 'user1', _id: 'user1' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    });
    mockVerifyOTPOrBackupCode.mockResolvedValue({ verified: false, status: 400 });

    await deleteUserController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDeleteMessages).not.toHaveBeenCalled();
  });

  it('returns 401 when 2FA is enabled and invalid TOTP token provided', async () => {
    const existingUser = {
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    };
    const req = { user: { id: 'user1', _id: 'user1' }, body: { token: 'wrong' } };
    const res = createRes();
    mockGetUserById.mockResolvedValue(existingUser);
    mockVerifyOTPOrBackupCode.mockResolvedValue({
      verified: false,
      status: 401,
      message: 'Invalid token or backup code',
    });

    await deleteUserController(req, res);

    expect(mockVerifyOTPOrBackupCode).toHaveBeenCalledWith({
      user: existingUser,
      token: 'wrong',
      backupCode: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token or backup code' });
    expect(mockDeleteMessages).not.toHaveBeenCalled();
  });

  it('returns 401 when 2FA is enabled and invalid backup code provided', async () => {
    const existingUser = {
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
      backupCodes: [],
    };
    const req = { user: { id: 'user1', _id: 'user1' }, body: { backupCode: 'bad-code' } };
    const res = createRes();
    mockGetUserById.mockResolvedValue(existingUser);
    mockVerifyOTPOrBackupCode.mockResolvedValue({
      verified: false,
      status: 401,
      message: 'Invalid token or backup code',
    });

    await deleteUserController(req, res);

    expect(mockVerifyOTPOrBackupCode).toHaveBeenCalledWith({
      user: existingUser,
      token: undefined,
      backupCode: 'bad-code',
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockDeleteMessages).not.toHaveBeenCalled();
  });

  it('deletes account when valid TOTP token provided with 2FA enabled', async () => {
    const existingUser = {
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
    };
    const req = {
      user: { id: 'user1', _id: 'user1', email: 'a@b.com' },
      body: { token: '123456' },
    };
    const res = createRes();
    mockGetUserById.mockResolvedValue(existingUser);
    mockVerifyOTPOrBackupCode.mockResolvedValue({ verified: true });

    await deleteUserController(req, res);

    expect(mockVerifyOTPOrBackupCode).toHaveBeenCalledWith({
      user: existingUser,
      token: '123456',
      backupCode: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'User deleted' });
    expect(mockDeleteMessages).toHaveBeenCalled();
  });

  it('deletes account when valid backup code provided with 2FA enabled', async () => {
    const existingUser = {
      _id: 'user1',
      twoFactorEnabled: true,
      totpSecret: 'enc-secret',
      backupCodes: [{ codeHash: 'h1', used: false }],
    };
    const req = {
      user: { id: 'user1', _id: 'user1', email: 'a@b.com' },
      body: { backupCode: 'valid-code' },
    };
    const res = createRes();
    mockGetUserById.mockResolvedValue(existingUser);
    mockVerifyOTPOrBackupCode.mockResolvedValue({ verified: true });

    await deleteUserController(req, res);

    expect(mockVerifyOTPOrBackupCode).toHaveBeenCalledWith({
      user: existingUser,
      token: undefined,
      backupCode: 'valid-code',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'User deleted' });
    expect(mockDeleteMessages).toHaveBeenCalled();
  });
});

describe('deleteUserController - interactive generation quiesce', () => {
  const { GenerationJobManager } = require('@librechat/api');

  it('aborts discovered generations and defers the cascade instead of racing their unwind', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    GenerationJobManager.getActiveJobIdsForUser.mockResolvedValueOnce(['conv-live']);

    await deleteUserController(req, res);

    // An abort changes the job's status; it does NOT drain the generation owner's
    // asynchronous message/usage/balance writes. Cascading in the same pass would
    // let those writes recreate rows for the deleted account, so the cascade is
    // deferred to the sweep — the barrier and commitment are already durable.
    expect(GenerationJobManager.abortJob).toHaveBeenCalledWith('conv-live');
    expect(res.set).toHaveBeenCalledWith('Retry-After', '30');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteMessages).not.toHaveBeenCalled();
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });

  it('defers while an owner finalization (deferred title) is still landing', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    // Active set already empty — the job completed — but the owner's deferred
    // title (billed balance/transaction writes) has not settled yet.
    GenerationJobManager.countUserFinalizations.mockResolvedValueOnce(1);

    await deleteUserController(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteMessages).not.toHaveBeenCalled();
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });

  it('fences an abort whose signal never left this replica and re-signals it', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    GenerationJobManager.getActiveJobIdsForUser.mockResolvedValueOnce(['conv-peer']);
    // The CAS wins on the shared store but delivery AND publication provably
    // failed: the peer owner keeps generating while the job reads terminal.
    GenerationJobManager.abortJob.mockResolvedValueOnce({
      success: true,
      signalDelivered: false,
      signalPublished: false,
    });

    await deleteUserController(req, res);

    // Without the marker, the next pass sees no active job and no fence — the
    // cascade would run while the peer recreates messages/usage/balances.
    const db = require('~/models');
    expect(db.addUserAbortFence).toHaveBeenCalledWith('user1', 'conv-peer');
    // The fence is durable BEFORE the CAS, so a write failure would have refused
    // the abort while it was still side-effect free.
    expect(db.addUserAbortFence.mock.invocationCallOrder[0]).toBeLessThan(
      GenerationJobManager.abortJob.mock.invocationCallOrder[0],
    );
    expect(db.clearUserAbortFence).not.toHaveBeenCalled();
    expect(GenerationJobManager.resignalAbort).toHaveBeenCalledWith('conv-peer');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });

  it('keeps the fence when the abort THROWS, instead of reading it as acknowledged', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    GenerationJobManager.getActiveJobIdsForUser.mockResolvedValueOnce(['conv-peer']);
    // abortJob can raise AFTER its terminal CAS landed (content refresh, required
    // persistence, publication). The job is then invisible to every later active-set
    // scan, so treating the throw as an acknowledgement cleared the only record of an
    // unconfirmed stop and let the cascade run against a live peer generation.
    GenerationJobManager.abortJob.mockRejectedValueOnce(new Error('publish exploded'));

    await deleteUserController(req, res);

    const db = require('~/models');
    expect(db.addUserAbortFence).toHaveBeenCalledWith('user1', 'conv-peer');
    expect(db.clearUserAbortFence).not.toHaveBeenCalled();
    // Inconclusive, so it is re-driven rather than assumed delivered.
    expect(GenerationJobManager.resignalAbort).toHaveBeenCalledWith('conv-peer');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });

  it('refuses to abort at all when the durable fence cannot be written', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    const db = require('~/models');
    GenerationJobManager.getActiveJobIdsForUser.mockResolvedValueOnce(['conv-peer']);
    db.addUserAbortFence.mockRejectedValueOnce(new Error('mongo down'));

    await deleteUserController(req, res);

    // Aborting first and fencing after left the job terminal (invisible to later
    // active-set scans) with nothing recording the unacknowledged signal.
    expect(GenerationJobManager.abortJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });

  it('keeps the fence when abortJob resolves unsuccessfully WITHOUT signal fields', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    const db = require('~/models');
    GenerationJobManager.getActiveJobIdsForUser.mockResolvedValueOnce(['conv-peer']);
    // The lost-CAS / already-terminal returns carry NO signal fields — e.g. a
    // concurrent Stop won the abort but its own publish failed. Testing `!== false`
    // read those absent fields as an acknowledgement and cleared the only record of
    // an unconfirmed stop; clearing requires POSITIVE evidence.
    GenerationJobManager.abortJob.mockResolvedValueOnce({
      success: false,
      jobData: null,
      content: [],
      finalEvent: null,
      text: '',
      collectedUsage: [],
    });

    await deleteUserController(req, res);

    expect(db.clearUserAbortFence).not.toHaveBeenCalled();
    expect(GenerationJobManager.resignalAbort).toHaveBeenCalledWith('conv-peer');
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });

  it('clears a fence whose run reached its own complete terminal, instead of fencing forever', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    const db = require('~/models');
    db.getUserAbortFences.mockResolvedValueOnce(['conv-peer']);
    // The generation ended by its own means: no stop is left to deliver, and
    // resignalAbort (aborted-only) could never clear this fence — it would sit
    // permanent and defer the deletion forever. Post-terminal billed work is what
    // the owner-finalization markers fence, not this record.
    GenerationJobManager.getJob.mockResolvedValueOnce({
      status: 'complete',
      createdAt: 1000,
      metadata: { userId: 'user1' },
    });

    await deleteUserController(req, res);

    expect(db.clearUserAbortFence).toHaveBeenCalledWith('user1', 'conv-peer');
    expect(GenerationJobManager.resignalAbort).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('clears the fence immediately when the abort is acknowledged', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    const db = require('~/models');
    GenerationJobManager.getActiveJobIdsForUser.mockResolvedValueOnce(['conv-live']);
    GenerationJobManager.abortJob.mockResolvedValueOnce({
      success: true,
      signalDelivered: true,
      signalPublished: true,
    });

    await deleteUserController(req, res);

    // The common case leaves no fence behind for later passes to settle.
    expect(db.clearUserAbortFence).toHaveBeenCalledWith('user1', 'conv-live');
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('clears an abort fence once the owner finished and the job is gone', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    const db = require('~/models');
    db.getUserAbortFences.mockResolvedValueOnce(['conv-peer']);
    GenerationJobManager.getJob.mockResolvedValueOnce(undefined);

    await deleteUserController(req, res);

    // Job absent means the owner finished (or cleaned up): its writes are done, so
    // the fence clears. The pass still defers — settlement is only claimed once a
    // LATER pass sees no fences at all.
    expect(db.clearUserAbortFence).toHaveBeenCalledWith('user1', 'conv-peer');
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('keeps deferring while the republication still cannot leave this replica', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    const db = require('~/models');
    db.getUserAbortFences.mockResolvedValueOnce(['conv-peer']);
    GenerationJobManager.getJob.mockResolvedValueOnce({
      status: 'aborted',
      createdAt: 1000,
      // Ownership lives on the FACADE METADATA; reading job.userId saw undefined
      // and cleared every fence as reassigned without ever re-signalling.
      metadata: { userId: 'user1' },
    });
    GenerationJobManager.resignalAbort.mockResolvedValueOnce({
      delivered: false,
      published: false,
    });

    await deleteUserController(req, res);

    expect(GenerationJobManager.resignalAbort).toHaveBeenCalledWith('conv-peer', 1000);
    // Fence kept, not cleared: the signal is still only on this replica.
    expect(db.clearUserAbortFence).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });

  it('settles the abort fence when the republication finally leaves', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    const db = require('~/models');
    db.getUserAbortFences.mockResolvedValueOnce(['conv-peer']);
    GenerationJobManager.getJob.mockResolvedValueOnce({
      status: 'aborted',
      createdAt: 1000,
      metadata: { userId: 'user1' },
    });
    // Default resignal mock publishes.

    await deleteUserController(req, res);

    expect(GenerationJobManager.resignalAbort).toHaveBeenCalledWith('conv-peer', 1000);
    expect(db.clearUserAbortFence).toHaveBeenCalledWith('user1', 'conv-peer');
    // The acknowledged fence is the last one, so this pass settles and cascades.
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDeleteUserById).toHaveBeenCalled();
  });

  it('defers on an unreadable fence list rather than concluding settlement', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    const db = require('~/models');
    // getUserAbortFences fails closed with a sentinel when the document cannot be read.
    db.getUserAbortFences.mockResolvedValueOnce(['__unreadable__']);

    await deleteUserController(req, res);

    expect(GenerationJobManager.getJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });

  it('fails closed when the job store cannot be enumerated', async () => {
    const req = { user: { id: 'user1', _id: 'user1', email: 'a@b.com' }, body: {} };
    const res = createRes();
    mockGetUserById.mockResolvedValue({ _id: 'user1', twoFactorEnabled: false });
    GenerationJobManager.getActiveJobIdsForUser.mockRejectedValueOnce(new Error('store down'));

    await deleteUserController(req, res);

    // Unknown generation state must defer, not destroy: a live generation this
    // pass could not see may still be writing.
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockDeleteMessages).not.toHaveBeenCalled();
    expect(mockDeleteUserById).not.toHaveBeenCalled();
  });
});
