const { syncUserOidcGroupsFromToken } = require('./PermissionService');
const { extractGroupsFromToken } = require('~/utils/extractJwtClaims');
const { Group } = require('~/db/models');

// Mock dependencies
jest.mock('~/utils/extractJwtClaims');
jest.mock('~/db/models');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

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
      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue({});
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(extractGroupsFromToken).toHaveBeenCalledWith(
        tokenset,
        'realm_access.roles', // default claim path
        'access', // default token kind
      );
    });

    it('should use configured environment variables', async () => {
      process.env.OPENID_GROUPS_CLAIM_PATH = 'custom.path.groups';
      process.env.OPENID_GROUPS_TOKEN_KIND = 'id';
      process.env.OPENID_GROUP_SOURCE = 'keycloak';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { id_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['group1']);
      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue({});
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(extractGroupsFromToken).toHaveBeenCalledWith(
        tokenset,
        'custom.path.groups',
        'id',
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
      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue({});
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.create).toHaveBeenCalledTimes(2);
      expect(Group.create).toHaveBeenCalledWith(
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
      expect(Group.create).toHaveBeenCalledWith(
        [
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
        name: 'admin',
        memberIds: ['other-user'],
      };
      
      Group.findOne = jest.fn().mockResolvedValue(existingGroup);
      Group.updateOne = jest.fn().mockResolvedValue({});
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.updateOne).toHaveBeenCalledWith(
        { _id: 'group-id' },
        { $addToSet: { memberIds: 'user-123' } },
        {},
      );
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
        name: 'admin',
        memberIds: ['user-123', 'other-user'],
      };
      
      Group.findOne = jest.fn().mockResolvedValue(existingGroup);
      Group.updateOne = jest.fn().mockResolvedValue({});
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.updateOne).not.toHaveBeenCalled();
    });

    it('should remove user from groups they no longer belong to', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin', 'developer']);
      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue({});
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
      expect(Group.findOne).not.toHaveBeenCalled();
      expect(Group.create).not.toHaveBeenCalled();
    });

    it('should use custom group source', async () => {
      process.env.OPENID_GROUP_SOURCE = 'keycloak';

      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin']);
      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue({});
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      expect(Group.create).toHaveBeenCalledWith(
        [
          {
            name: 'admin',
            idOnTheSource: 'admin',
            source: 'keycloak',
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

    it('should continue processing other groups if one fails', async () => {
      const user = {
        email: 'test@example.com',
        provider: 'openid',
        idOnTheSource: 'user-123',
      };
      const tokenset = { access_token: 'token' };

      extractGroupsFromToken.mockReturnValue(['admin', 'developer', 'user']);
      
      Group.findOne = jest.fn()
        .mockResolvedValueOnce(null) // admin - will create
        .mockRejectedValueOnce(new Error('Database error')) // developer - will fail
        .mockResolvedValueOnce(null); // user - will create
      
      Group.create = jest.fn().mockResolvedValue({});
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset);

      // Should have attempted to create admin and user, but not developer
      expect(Group.create).toHaveBeenCalledTimes(2);
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
      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue({});
      Group.updateMany = jest.fn().mockResolvedValue({});

      await syncUserOidcGroupsFromToken(user, tokenset, session);

      expect(Group.create).toHaveBeenCalledWith(
        expect.any(Array),
        { session },
      );
      expect(Group.updateMany).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        { session },
      );
    });
  });
});

