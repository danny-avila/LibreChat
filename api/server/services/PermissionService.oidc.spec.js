// Mock dependencies BEFORE imports to prevent initialization errors
jest.mock('~/utils/extractJwtClaims');
jest.mock('~/db/models');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getTransactionSupport: jest.fn(),
  isEnabled: jest.fn((val) => val === 'true' || val === true),
  createModels: jest.fn(() => ({
    User: {},
    Key: {},
    Session: {},
    Balance: {},
    Transaction: {},
    Group: {},
    Conversation: {},
    Message: {},
    Assistant: {},
    Agent: {},
    ToolCall: {},
    Action: {},
    Prompt: {},
    PromptGroup: {},
    Preset: {},
    File: {},
    ConversationTag: {},
    Categories: {},
    Role: {},
    AclEntry: {},
    AccessRole: {},
    Project: {},
    Banner: {},
  })),
}));
jest.mock('~/server/services/GraphApiService', () => ({
  entraIdPrincipalFeatureEnabled: jest.fn(() => false),
  getUserEntraGroups: jest.fn(),
  getUserOwnedEntraGroups: jest.fn(),
  getGroupMembers: jest.fn(),
  getGroupOwners: jest.fn(),
}));
jest.mock('~/models', () => ({
  findAccessibleResources: jest.fn(),
  getEffectivePermissions: jest.fn(),
  grantPermission: jest.fn(),
  findEntriesByPrincipalsAndResource: jest.fn(),
  findGroupByExternalId: jest.fn(),
  findRoleByIdentifier: jest.fn(),
  getUserPrincipals: jest.fn(),
  hasPermission: jest.fn(),
  createGroup: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  findUser: jest.fn(),
}));
jest.mock('@librechat/api', () => ({
  isEnabled: jest.fn((val) => val === 'true' || val === true),
}));

// Now import after mocks are set up
const { syncUserOidcGroupsFromToken } = require('./PermissionService');
const { extractGroupsFromToken } = require('~/utils/extractJwtClaims');
const { Group } = require('~/db/models');

describe('syncUserOidcGroupsFromToken', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Feature Flag and Validation', () => {
    it('should return early if feature is not enabled', async () => {
      process.env.OPENID_SYNC_GROUPS_FROM_TOKEN = 'false';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(extractGroupsFromToken).not.toHaveBeenCalled();
    });

    it('should return early if user provider is not openid', async () => {
      process.env.OPENID_SYNC_GROUPS_FROM_TOKEN = 'true';

      const user = {
        email: 'test@example.com',
        provider: 'google',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(extractGroupsFromToken).not.toHaveBeenCalled();
    });

    it('should return early if user does not have idOnTheSource', async () => {
      process.env.OPENID_SYNC_GROUPS_FROM_TOKEN = 'true';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
      };
      const tokenset = { access_token: 'token' };

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(extractGroupsFromToken).not.toHaveBeenCalled();
    });

    it('should return early if tokenset is invalid', async () => {
      process.env.OPENID_SYNC_GROUPS_FROM_TOKEN = 'true';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };

      await syncUserOidcGroupsFromToken(user, null);

      expect(extractGroupsFromToken).not.toHaveBeenCalled();
    });
  });

  describe('Group Extraction and Sync', () => {
    beforeEach(() => {
      process.env.OPENID_SYNC_GROUPS_FROM_TOKEN = 'true';
    });

    it('should use default configuration values', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin', 'user']);
      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(extractGroupsFromToken).toHaveBeenCalledWith(
        tokenset,
        'realm_access.roles', // default claim path
        'access', // default token kind
        null, // default exclusion pattern
      );
    });

    it('should use configured environment variables', async () => {
      process.env.OPENID_GROUPS_CLAIM_PATH = 'custom.path.groups';
      process.env.OPENID_GROUPS_TOKEN_KIND = 'id';
      process.env.OPENID_GROUP_SOURCE = 'oidc';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { id_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['group1']);
      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(extractGroupsFromToken).toHaveBeenCalledWith(
        tokenset,
        'custom.path.groups',
        'id',
        null, // exclusion pattern not set in this test
      );
    });

    it('should create new groups that do not exist', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin', 'developer']);
      Group.find = jest.fn().mockResolvedValue([]); // No existing groups
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.insertMany).toHaveBeenCalledWith(
        [
          {
            name: 'admin',
            idOnTheSource: 'admin',
            source: 'oidc',
            memberIds: ['user-123'],
          },
          {
            name: 'developer',
            idOnTheSource: 'developer',
            source: 'oidc',
            memberIds: ['user-123'],
          },
        ],
        {},
      );
    });

    it('should add user to existing group if not already a member', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin']);

      const existingGroup = {
        _id: 'group-id',
        idOnTheSource: 'admin',
        name: 'admin',
        memberIds: ['other-user'],
      };

      Group.find = jest.fn().mockResolvedValue([existingGroup]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      // Should call updateMany twice: once for adding user to groups, once for cleanup
      expect(Group.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['group-id'] } },
        { $addToSet: { memberIds: 'user-123' } },
        {},
      );
      expect(Group.insertMany).not.toHaveBeenCalled();
    });

    it('should not add user if already a member', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin']);

      const existingGroup = {
        _id: 'group-id',
        idOnTheSource: 'admin',
        name: 'admin',
        memberIds: ['user-123', 'other-user'],
      };

      Group.find = jest.fn().mockResolvedValue([existingGroup]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      // Should not call insertMany or updateMany for adding user (user already member)
      expect(Group.insertMany).not.toHaveBeenCalled();
      // updateMany is only called for cleanup (removing from old groups)
      expect(Group.updateMany).toHaveBeenCalledTimes(1);
      expect(Group.updateMany).toHaveBeenCalledWith(
        {
          source: 'oidc',
          memberIds: 'user-123',
          idOnTheSource: { $nin: ['admin'] },
        },
        { $pull: { memberIds: 'user-123' } },
        {},
      );
    });

    it('should remove user from groups they no longer belong to', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin', 'developer']);
      Group.find = jest.fn().mockResolvedValue([]); // No existing groups
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.updateMany).toHaveBeenCalledWith(
        {
          source: 'oidc',
          memberIds: 'user-123',
          idOnTheSource: { $nin: ['admin', 'developer'] },
        },
        { $pull: { memberIds: 'user-123' } },
        {},
      );
    });

    it('should handle empty groups list by removing user from all groups', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue([]);
      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.updateMany).toHaveBeenCalledWith(
        {
          source: 'oidc',
          memberIds: 'user-123',
        },
        { $pull: { memberIds: 'user-123' } },
        {},
      );
      expect(Group.find).not.toHaveBeenCalled();
      expect(Group.insertMany).not.toHaveBeenCalled();
    });

    it('should use custom group source', async () => {
      process.env.OPENID_GROUP_SOURCE = 'oidc';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin']);
      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.insertMany).toHaveBeenCalledWith(
        [
          {
            name: 'admin',
            idOnTheSource: 'admin',
            source: 'oidc',
            memberIds: ['user-123'],
          },
        ],
        {},
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      process.env.OPENID_SYNC_GROUPS_FROM_TOKEN = 'true';
    });

    it('should handle errors gracefully and not throw', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockImplementation(() => {
        throw new Error('Extraction failed');
      });

      await expect(syncUserOidcGroupsFromToken(user, tokenset)).resolves.not.toThrow();
    });

    it('should handle insertMany errors gracefully', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin', 'developer', 'user']);

      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockRejectedValue(new Error('Database error'));
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      // Should have attempted to insert groups
      expect(Group.insertMany).toHaveBeenCalledTimes(1);
      // Should still call cleanup updateMany despite insertMany error
      expect(Group.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('Session Support', () => {
    beforeEach(() => {
      process.env.OPENID_SYNC_GROUPS_FROM_TOKEN = 'true';
    });

    it('should pass session to database operations when provided', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };
      const session = { id: 'session-123' };

      extractGroupsFromToken.mockReturnValue(['admin']);
      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset, session);

      expect(Group.insertMany).toHaveBeenCalledWith(expect.any(Array), { session });
      expect(Group.updateMany).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
        session,
      });
    });
  });

  describe('Security Features', () => {
    beforeEach(() => {
      process.env.OPENID_SYNC_GROUPS_FROM_TOKEN = 'true';
    });

    it('should limit groups to OPENID_MAX_GROUPS_PER_USER', async () => {
      process.env.OPENID_MAX_GROUPS_PER_USER = '5';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      const manyGroups = Array.from({ length: 10 }, (_, i) => `group${i}`);
      extractGroupsFromToken.mockReturnValue(manyGroups);
      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      // Should only process first 5 groups
      expect(Group.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'group0' }),
          expect.objectContaining({ name: 'group1' }),
          expect.objectContaining({ name: 'group2' }),
          expect.objectContaining({ name: 'group3' }),
          expect.objectContaining({ name: 'group4' }),
        ]),
        expect.any(Object),
      );
      expect(Group.insertMany).toHaveBeenCalledWith(
        expect.not.arrayContaining([expect.objectContaining({ name: 'group5' })]),
        expect.any(Object),
      );
    });

    it('should use default limit of 100 when OPENID_MAX_GROUPS_PER_USER is not set', async () => {
      delete process.env.OPENID_MAX_GROUPS_PER_USER;

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      const manyGroups = Array.from({ length: 150 }, (_, i) => `group${i}`);
      extractGroupsFromToken.mockReturnValue(manyGroups);
      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      // Should process 100 groups (default limit)
      const insertCall = Group.insertMany.mock.calls[0][0];
      expect(insertCall.length).toBe(100);
    });

    it('should pass exclusion pattern to extractGroupsFromToken', async () => {
      process.env.OPENID_GROUPS_EXCLUDE_PATTERN = 'system-role,regex:^test-.*';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin']);
      Group.find = jest.fn().mockResolvedValue([]);
      Group.insertMany = jest.fn().mockResolvedValue([]);
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(extractGroupsFromToken).toHaveBeenCalledWith(
        tokenset,
        'realm_access.roles',
        'access',
        'system-role,regex:^test-.*',
      );
    });

    it('should reject idOnTheSource with MongoDB operators', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: '$ne',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin']);
      Group.find = jest.fn();

      await syncUserOidcGroupsFromToken(user, tokenset);

      // Should not call Group.find because validation failed
      expect(Group.find).not.toHaveBeenCalled();
    });

    it('should reject idOnTheSource with curly braces', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: '{malicious}',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin']);
      Group.find = jest.fn();

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.find).not.toHaveBeenCalled();
    });

    it('should reject idOnTheSource with dots', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user.admin',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin']);
      Group.find = jest.fn();

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.find).not.toHaveBeenCalled();
    });
  });
});
