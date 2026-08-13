const { FileSources } = require('librechat-data-provider');
const { createSocialUser, handleExistingUser } = require('./process');

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/services/Files/images/avatar', () => ({
  resizeAvatar: jest.fn(),
}));

jest.mock('~/models', () => ({
  updateUser: jest.fn(),
  createUser: jest.fn(),
  getUserById: jest.fn(),
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn().mockResolvedValue({}),
}));

jest.mock('@librechat/api', () => ({
  getBalanceConfig: jest.fn(() => ({
    enabled: false,
  })),
}));

const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { resizeAvatar } = require('~/server/services/Files/images/avatar');
const { logger } = require('@librechat/data-schemas');
const { createUser, getUserById, updateUser } = require('~/models');

describe('handleExistingUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CDN_PROVIDER = FileSources.local;
  });

  it('should handle null avatar without throwing error', async () => {
    const oldUser = {
      _id: 'user123',
      avatar: null,
    };
    const avatarUrl = 'https://example.com/avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(updateUser).toHaveBeenCalledWith('user123', { avatar: avatarUrl });
  });

  it('should handle undefined avatar without throwing error', async () => {
    const oldUser = {
      _id: 'user123',
      // avatar is undefined
    };
    const avatarUrl = 'https://example.com/avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(updateUser).toHaveBeenCalledWith('user123', { avatar: avatarUrl });
  });

  it('should not update avatar if it has manual=true flag', async () => {
    const oldUser = {
      _id: 'user123',
      avatar: 'https://example.com/avatar.png?manual=true',
    };
    const avatarUrl = 'https://example.com/new-avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(updateUser).not.toHaveBeenCalled();
  });

  it('should update avatar for local storage when avatar has no manual flag', async () => {
    const oldUser = {
      _id: 'user123',
      avatar: 'https://example.com/old-avatar.png',
    };
    const avatarUrl = 'https://example.com/new-avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(updateUser).toHaveBeenCalledWith('user123', { avatar: avatarUrl });
  });

  it('should process avatar for non-local storage', async () => {
    process.env.CDN_PROVIDER = 's3';

    const mockProcessAvatar = jest.fn().mockResolvedValue('processed-avatar-url');
    getStrategyFunctions.mockReturnValue({ processAvatar: mockProcessAvatar });
    resizeAvatar.mockResolvedValue(Buffer.from('resized-image'));

    const oldUser = {
      _id: 'user123',
      avatar: null,
    };
    const avatarUrl = 'https://example.com/avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(resizeAvatar).toHaveBeenCalledWith({
      userId: 'user123',
      input: avatarUrl,
    });
    expect(mockProcessAvatar).toHaveBeenCalledWith({
      buffer: Buffer.from('resized-image'),
      userId: 'user123',
      manual: 'false',
    });
    expect(updateUser).toHaveBeenCalledWith('user123', { avatar: 'processed-avatar-url' });
  });

  it('should not update if avatar already has manual flag in non-local storage', async () => {
    process.env.CDN_PROVIDER = 's3';

    const oldUser = {
      _id: 'user123',
      avatar: 'https://cdn.example.com/avatar.png?manual=true',
    };
    const avatarUrl = 'https://example.com/new-avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(resizeAvatar).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('should handle avatar with query parameters but without manual flag', async () => {
    const oldUser = {
      _id: 'user123',
      avatar: 'https://example.com/avatar.png?size=large&format=webp',
    };
    const avatarUrl = 'https://example.com/new-avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(updateUser).toHaveBeenCalledWith('user123', { avatar: avatarUrl });
  });

  it('should handle empty string avatar', async () => {
    const oldUser = {
      _id: 'user123',
      avatar: '',
    };
    const avatarUrl = 'https://example.com/avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(updateUser).toHaveBeenCalledWith('user123', { avatar: avatarUrl });
  });

  it('should handle avatar with manual=false parameter', async () => {
    const oldUser = {
      _id: 'user123',
      avatar: 'https://example.com/avatar.png?manual=false',
    };
    const avatarUrl = 'https://example.com/new-avatar.png';

    await handleExistingUser(oldUser, avatarUrl);

    expect(updateUser).toHaveBeenCalledWith('user123', { avatar: avatarUrl });
  });

  it('should handle oldUser being null gracefully', async () => {
    const avatarUrl = 'https://example.com/avatar.png';

    // This should throw an error when trying to access oldUser._id
    await expect(handleExistingUser(null, avatarUrl)).rejects.toThrow();
  });

  it('should update email when it has changed', async () => {
    const oldUser = {
      _id: 'user123',
      email: 'old@example.com',
      avatar: 'https://example.com/avatar.png?manual=true',
    };
    const avatarUrl = 'https://example.com/avatar.png';
    const newEmail = 'new@example.com';

    await handleExistingUser(oldUser, avatarUrl, {}, newEmail);

    expect(updateUser).toHaveBeenCalledWith('user123', { email: 'new@example.com' });
  });

  it('should update both avatar and email when both have changed', async () => {
    const oldUser = {
      _id: 'user123',
      email: 'old@example.com',
      avatar: null,
    };
    const avatarUrl = 'https://example.com/new-avatar.png';
    const newEmail = 'new@example.com';

    await handleExistingUser(oldUser, avatarUrl, {}, newEmail);

    expect(updateUser).toHaveBeenCalledWith('user123', {
      avatar: avatarUrl,
      email: 'new@example.com',
    });
  });

  it('should not update email when it has not changed', async () => {
    const oldUser = {
      _id: 'user123',
      email: 'same@example.com',
      avatar: 'https://example.com/avatar.png?manual=true',
    };
    const avatarUrl = 'https://example.com/avatar.png';
    const sameEmail = 'same@example.com';

    await handleExistingUser(oldUser, avatarUrl, {}, sameEmail);

    expect(updateUser).not.toHaveBeenCalled();
  });

  it('should trim email before comparison and update', async () => {
    const oldUser = {
      _id: 'user123',
      email: 'test@example.com',
      avatar: 'https://example.com/avatar.png?manual=true',
    };
    const avatarUrl = 'https://example.com/avatar.png';
    const newEmailWithSpaces = '  newemail@example.com  ';

    await handleExistingUser(oldUser, avatarUrl, {}, newEmailWithSpaces);

    expect(updateUser).toHaveBeenCalledWith('user123', { email: 'newemail@example.com' });
  });

  it('should not update when email parameter is not provided', async () => {
    const oldUser = {
      _id: 'user123',
      email: 'test@example.com',
      avatar: 'https://example.com/avatar.png?manual=true',
    };
    const avatarUrl = 'https://example.com/avatar.png';

    await handleExistingUser(oldUser, avatarUrl, {});

    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe('createSocialUser optional avatar handling', () => {
  const baseInput = {
    email: 'clerk@example.com',
    provider: 'clerk',
    providerKey: 'clerkId',
    providerId: 'user_clerk',
    username: 'clerk-user',
    name: 'Clerk User',
    appConfig: {},
    emailVerified: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CDN_PROVIDER = FileSources.local;
    createUser.mockResolvedValue('new-user-id');
    getUserById.mockResolvedValue({
      _id: 'new-user-id',
      email: baseInput.email,
      provider: 'clerk',
      clerkId: 'user_clerk',
    });
  });

  it.each([undefined, '', 'file:///etc/passwd', 'https://user:pass@example.com/avatar.png'])(
    'creates without fetching a missing or unsafe avatar value (%s)',
    async (avatarUrl) => {
      await expect(createSocialUser({ ...baseInput, avatarUrl })).resolves.toMatchObject({
        _id: 'new-user-id',
      });

      expect(createUser.mock.calls[0][0]).not.toHaveProperty('avatar');
      expect(resizeAvatar).not.toHaveBeenCalled();
      expect(getStrategyFunctions).not.toHaveBeenCalled();
    },
  );

  it('stores a safe avatar directly for local file storage', async () => {
    const avatarUrl = 'https://images.example.com/avatar.png';

    await createSocialUser({ ...baseInput, avatarUrl });

    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ avatar: avatarUrl }),
      expect.any(Object),
    );
    expect(resizeAvatar).not.toHaveBeenCalled();
  });

  it('treats a valid remote avatar processing failure as best effort without logging the URL', async () => {
    process.env.CDN_PROVIDER = 's3';
    const avatarUrl = 'https://images.example.com/private-avatar.png';
    resizeAvatar.mockRejectedValue(new Error('download failed'));

    await expect(createSocialUser({ ...baseInput, avatarUrl })).resolves.toMatchObject({
      _id: 'new-user-id',
    });

    expect(createUser.mock.calls[0][0]).not.toHaveProperty('avatar');
    expect(updateUser).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[createSocialUser] Avatar processing failed after user creation',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(avatarUrl);
  });

  it('stores a processed non-local avatar after user creation succeeds', async () => {
    process.env.CDN_PROVIDER = 's3';
    const avatarUrl = 'https://images.example.com/avatar.png';
    const processAvatar = jest.fn().mockResolvedValue('stored-avatar');
    resizeAvatar.mockResolvedValue(Buffer.from('resized-avatar'));
    getStrategyFunctions.mockReturnValue({ processAvatar });

    await createSocialUser({ ...baseInput, avatarUrl });

    expect(resizeAvatar).toHaveBeenCalledWith({
      userId: 'new-user-id',
      input: avatarUrl,
    });
    expect(updateUser).toHaveBeenCalledWith('new-user-id', { avatar: 'stored-avatar' });
  });
});
