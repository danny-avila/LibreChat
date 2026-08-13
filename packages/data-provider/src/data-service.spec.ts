import type { TClerkLoginResponse, TUser } from './types';
import { loginClerk } from './data-service';
import request from './request';

jest.mock('./request', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

const post = request.post as jest.Mock;

const user: TUser = {
  id: 'user-1',
  username: 'clerk-user',
  email: 'user@example.com',
  name: 'Clerk User',
  avatar: '',
  role: 'USER',
  provider: 'clerk',
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
};

describe('loginClerk', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('posts the strict Clerk token request to the Clerk login endpoint', async () => {
    const response: TClerkLoginResponse = { token: 'librechat-token', user };
    post.mockResolvedValue(response);

    await expect(loginClerk({ clerkToken: 'clerk-session-token' })).resolves.toEqual(response);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/api/auth/clerk', {
      clerkToken: 'clerk-session-token',
    });
  });

  it('preserves the two-factor-pending response union member', async () => {
    const response: TClerkLoginResponse = {
      twoFAPending: true,
      tempToken: 'tenant-bound-temp-token',
    };
    post.mockResolvedValue(response);

    const result = await loginClerk({ clerkToken: 'clerk-session-token' });

    expect(result).toEqual(response);
    expect(result.twoFAPending).toBe(true);
  });
});
