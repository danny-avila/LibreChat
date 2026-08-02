import { hashToken } from '@librechat/data-schemas';
import {
  EMAIL_CHANGE_TOKEN_TYPE,
  createEmailChangeService,
  type EmailChangeDeps,
  type EmailChangeToken,
  type EmailChangeUser,
} from './email';

const user: EmailChangeUser = {
  _id: '507f1f77bcf86cd799439011',
  email: 'old@example.com',
  name: 'Test User',
  password: 'password-hash',
  provider: 'local',
  tenantId: 'tenant-1',
};

function createDeps(overrides: Partial<EmailChangeDeps> = {}) {
  const deps: EmailChangeDeps = {
    findUserByEmail: jest.fn().mockResolvedValue(null),
    getUserById: jest.fn().mockResolvedValue(user),
    updateUser: jest.fn().mockResolvedValue({ ...user, email: 'new@example.com' }),
    findToken: jest.fn().mockResolvedValue(null),
    upsertToken: jest.fn().mockResolvedValue(undefined),
    deleteTokens: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    verifyPassword: jest.fn().mockResolvedValue(true),
    sendEmail: jest.fn().mockResolvedValue(undefined),
    isEmailChangeAllowed: jest.fn().mockReturnValue(true),
    clientDomain: 'https://chat.example.com/',
    appName: 'LibreChat',
    ...overrides,
  };
  return { deps, service: createEmailChangeService(deps) };
}

describe('email change service', () => {
  describe('requestEmailChange', () => {
    it('rejects requests when email changes are disabled', async () => {
      const { deps, service } = createDeps({
        isEmailChangeAllowed: jest.fn().mockReturnValue(false),
      });

      const response = await service.requestEmailChange({
        body: { currentPassword: 'correct-password', newEmail: 'new@example.com' },
        userId: '507f1f77bcf86cd799439011',
        tenantId: 'tenant-1',
        emailEnabled: true,
      });

      expect(response).toEqual({
        status: 403,
        message: 'Email changes are disabled',
        code: 'email_change_disabled',
      });
      expect(deps.getUserById).not.toHaveBeenCalled();
      expect(deps.sendEmail).not.toHaveBeenCalled();
    });

    it('verifies the password, records the IP, alerts the old address, and verifies the new one', async () => {
      const { deps, service } = createDeps();

      const response = await service.requestEmailChange({
        body: { currentPassword: 'correct-password', newEmail: ' New@Example.com ' },
        userId: '507f1f77bcf86cd799439011',
        tenantId: 'tenant-1',
        allowedDomains: ['example.com'],
        emailEnabled: true,
        ip: '203.0.113.8',
      });

      expect(response).toEqual({
        status: 200,
        message: 'Verification link sent to your new email address',
      });
      expect(deps.verifyPassword).toHaveBeenCalledWith(user, 'correct-password');
      expect(deps.upsertToken).toHaveBeenCalledWith(
        'email_change:507f1f77bcf86cd799439011',
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          email: 'new@example.com',
          scope: 'email_change:507f1f77bcf86cd799439011',
          identifier: 'old@example.com',
          type: EMAIL_CHANGE_TOKEN_TYPE,
          expiresIn: 900,
          metadata: {
            requestIp: '203.0.113.8',
            passwordFingerprint: expect.any(String),
          },
        }),
        'tenant-1',
      );
      expect(deps.sendEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          email: 'old@example.com',
          template: 'emailChangeAttempt.handlebars',
        }),
      );
      expect(deps.sendEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          email: 'new@example.com',
          template: 'verifyEmailChange.handlebars',
          payload: expect.objectContaining({
            verificationLink: expect.stringMatching(
              /^https:\/\/chat\.example\.com\/verify\?type=email-change&userId=507f1f77bcf86cd799439011&email=new%40example\.com&token=/,
            ),
          }),
        }),
      );
    });

    it('notifies the old address but does not disclose conflicts until the password is valid', async () => {
      const { deps, service } = createDeps({
        verifyPassword: jest.fn().mockResolvedValue(false),
        findUserByEmail: jest.fn().mockResolvedValue({ ...user, _id: '507f1f77bcf86cd799439012' }),
      });

      const response = await service.requestEmailChange({
        body: { currentPassword: 'wrong-password', newEmail: 'taken@example.com' },
        userId: '507f1f77bcf86cd799439011',
        tenantId: 'tenant-1',
        emailEnabled: true,
        ip: '203.0.113.9',
      });

      expect(response).toMatchObject({ status: 401, code: 'current_password_invalid' });
      expect(deps.sendEmail).toHaveBeenCalledTimes(1);
      expect(deps.findUserByEmail).not.toHaveBeenCalled();
      expect(deps.upsertToken).not.toHaveBeenCalled();
    });

    it('returns an explicit conflict when the verified new address belongs to another account', async () => {
      const { deps, service } = createDeps({
        findUserByEmail: jest.fn().mockResolvedValue({
          ...user,
          _id: '507f1f77bcf86cd799439012',
          email: 'taken@example.com',
        }),
      });

      const response = await service.requestEmailChange({
        body: { currentPassword: 'correct-password', newEmail: 'taken@example.com' },
        userId: '507f1f77bcf86cd799439011',
        tenantId: 'tenant-1',
        emailEnabled: true,
      });

      expect(response).toMatchObject({ status: 409, code: 'email_in_use' });
      expect(deps.upsertToken).not.toHaveBeenCalled();
    });

    it('removes the pending token if verification delivery fails', async () => {
      const sendEmail = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('SMTP unavailable'));
      const { deps, service } = createDeps({ sendEmail });

      const response = await service.requestEmailChange({
        body: { currentPassword: 'correct-password', newEmail: 'new@example.com' },
        userId: '507f1f77bcf86cd799439011',
        tenantId: 'tenant-1',
        emailEnabled: true,
      });

      expect(response).toMatchObject({ status: 500, code: 'email_delivery_failed' });
      expect(deps.deleteTokens).toHaveBeenLastCalledWith(
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          email: 'new@example.com',
          type: EMAIL_CHANGE_TOKEN_TYPE,
          token: expect.any(String),
        }),
        'tenant-1',
      );
    });

    it('keeps only the newest pending token when requests overlap', async () => {
      const storedTokens: Array<{ email?: string; token: string }> = [];
      const deleteTokens = jest.fn(async () => {
        storedTokens.splice(0);
        return { deletedCount: 1 };
      });
      const upsertToken = jest.fn(
        async (_scope: string, data: { email?: string; token: string }) => {
          storedTokens.splice(0, storedTokens.length, data);
        },
      );
      const { service } = createDeps({
        upsertToken: upsertToken as EmailChangeDeps['upsertToken'],
        deleteTokens,
      });

      const responses = await Promise.all([
        service.requestEmailChange({
          body: { currentPassword: 'correct-password', newEmail: 'first@example.com' },
          userId: '507f1f77bcf86cd799439011',
          tenantId: 'tenant-1',
          emailEnabled: true,
        }),
        service.requestEmailChange({
          body: { currentPassword: 'correct-password', newEmail: 'second@example.com' },
          userId: '507f1f77bcf86cd799439011',
          tenantId: 'tenant-1',
          emailEnabled: true,
        }),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([200, 200]);
      expect(storedTokens).toHaveLength(1);
      expect(deleteTokens).not.toHaveBeenCalled();
    });
  });

  describe('confirmEmailChange', () => {
    async function pendingToken(): Promise<EmailChangeToken> {
      return {
        userId: '507f1f77bcf86cd799439011',
        email: 'new@example.com',
        scope: 'email_change:507f1f77bcf86cd799439011',
        identifier: 'old@example.com',
        token: await hashToken('raw-token'),
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { passwordFingerprint: await hashToken(user.password!) },
        tenantId: 'tenant-1',
      } as EmailChangeToken;
    }

    it('rejects pending confirmations when email changes are disabled', async () => {
      const { deps, service } = createDeps({
        isEmailChangeAllowed: jest.fn().mockReturnValue(false),
        findToken: jest.fn().mockResolvedValue(await pendingToken()),
      });

      const response = await service.confirmEmailChange({
        body: {
          email: 'new@example.com',
          token: 'raw-token',
          userId: '507f1f77bcf86cd799439011',
        },
      });

      expect(response).toEqual({
        status: 403,
        message: 'Email changes are disabled',
        code: 'email_change_disabled',
      });
      expect(deps.findToken).not.toHaveBeenCalled();
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('rejects malformed user IDs before querying the database', async () => {
      const { deps, service } = createDeps();

      const response = await service.confirmEmailChange({
        body: { email: 'new@example.com', token: 'raw-token', userId: 'not-an-object-id' },
      });

      expect(response).toMatchObject({ status: 400, code: 'invalid_token' });
      expect(deps.findToken).not.toHaveBeenCalled();
    });

    it('consumes the token, changes the verified email, and confirms to both addresses', async () => {
      const { deps, service } = createDeps({
        findToken: jest.fn().mockResolvedValue(await pendingToken()),
      });

      const response = await service.confirmEmailChange({
        body: {
          email: 'NEW@example.com',
          token: 'raw-token',
          userId: '507f1f77bcf86cd799439011',
        },
        ip: '198.51.100.4',
      });

      expect(response).toEqual({ status: 200, message: 'Email address changed successfully' });
      expect(deps.deleteTokens).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          userId: '507f1f77bcf86cd799439011',
          email: 'new@example.com',
          type: EMAIL_CHANGE_TOKEN_TYPE,
          token: expect.any(String),
        }),
        'tenant-1',
      );
      expect(deps.updateUser).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { email: 'new@example.com', emailVerified: true },
        { email: 'old@example.com', password: 'password-hash' },
        'tenant-1',
      );
      expect(deps.sendEmail).toHaveBeenCalledTimes(2);
      expect(deps.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'old@example.com',
          template: 'emailChanged.handlebars',
        }),
      );
      expect(deps.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          template: 'emailChanged.handlebars',
        }),
      );
    });

    it('rejects an invalid token without updating the user', async () => {
      const { deps, service } = createDeps({
        findToken: jest.fn().mockResolvedValue(await pendingToken()),
      });

      const response = await service.confirmEmailChange({
        body: {
          email: 'new@example.com',
          token: 'wrong-token',
          userId: '507f1f77bcf86cd799439011',
        },
      });

      expect(response).toMatchObject({ status: 400, code: 'invalid_token' });
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('rejects an expired token even before the TTL cleanup removes it', async () => {
      const token = await pendingToken();
      token.expiresAt = new Date(Date.now() - 1);
      const { deps, service } = createDeps({ findToken: jest.fn().mockResolvedValue(token) });

      const response = await service.confirmEmailChange({
        body: {
          email: 'new@example.com',
          token: 'raw-token',
          userId: '507f1f77bcf86cd799439011',
        },
      });

      expect(response).toMatchObject({ status: 400, code: 'invalid_token' });
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('rejects a stale token after the account email has changed', async () => {
      const { deps, service } = createDeps({
        findToken: jest.fn().mockResolvedValue(await pendingToken()),
        getUserById: jest.fn().mockResolvedValue({ ...user, email: 'other@example.com' }),
      });

      const response = await service.confirmEmailChange({
        body: {
          email: 'new@example.com',
          token: 'raw-token',
          userId: '507f1f77bcf86cd799439011',
        },
      });

      expect(response).toMatchObject({ status: 400, code: 'invalid_token' });
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('rejects a pending token after the account password has changed', async () => {
      const { deps, service } = createDeps({
        findToken: jest.fn().mockResolvedValue(await pendingToken()),
        getUserById: jest.fn().mockResolvedValue({ ...user, password: 'new-password-hash' }),
      });

      const response = await service.confirmEmailChange({
        body: {
          email: 'new@example.com',
          token: 'raw-token',
          userId: '507f1f77bcf86cd799439011',
        },
      });

      expect(response).toMatchObject({ status: 400, code: 'invalid_token' });
      expect(deps.deleteTokens).not.toHaveBeenCalled();
      expect(deps.updateUser).not.toHaveBeenCalled();
    });

    it('allows only one competing confirmation to update the original account state', async () => {
      const firstToken = {
        ...(await pendingToken()),
        email: 'first@example.com',
        token: await hashToken('first-token'),
      };
      const secondToken = {
        ...(await pendingToken()),
        email: 'second@example.com',
        token: await hashToken('second-token'),
      };
      let accountEmail = user.email;
      let updateCallCount = 0;
      let releaseUpdates: (() => void) | undefined;
      const updatesReady = new Promise<void>((resolve) => {
        releaseUpdates = resolve;
      });
      const updateUser = jest.fn(
        async (
          _userId: string,
          update: { email: string; emailVerified: boolean },
          expected: { email: string; password: string },
        ) => {
          updateCallCount += 1;
          if (updateCallCount === 2) {
            releaseUpdates?.();
          }
          await updatesReady;
          if (expected?.email !== accountEmail || expected?.password !== user.password) {
            return null;
          }
          accountEmail = update.email;
          return { ...user, ...update };
        },
      );
      const { service } = createDeps({
        findToken: jest.fn(async ({ email }) =>
          email === firstToken.email ? firstToken : secondToken,
        ),
        getUserById: jest.fn().mockResolvedValue(user),
        updateUser: updateUser as EmailChangeDeps['updateUser'],
      });

      const responses = await Promise.all([
        service.confirmEmailChange({
          body: {
            email: 'first@example.com',
            token: 'first-token',
            userId: '507f1f77bcf86cd799439011',
          },
        }),
        service.confirmEmailChange({
          body: {
            email: 'second@example.com',
            token: 'second-token',
            userId: '507f1f77bcf86cd799439011',
          },
        }),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
      expect(['first@example.com', 'second@example.com']).toContain(accountEmail);
    });

    it('still succeeds and sends confirmations when post-commit cleanup fails', async () => {
      const deleteTokens = jest
        .fn()
        .mockResolvedValueOnce({ deletedCount: 1 })
        .mockResolvedValueOnce({ deletedCount: 1 })
        .mockResolvedValueOnce({ deletedCount: 1 })
        .mockRejectedValueOnce(new Error('cleanup unavailable'));
      const { deps, service } = createDeps({
        findToken: jest.fn().mockResolvedValue(await pendingToken()),
        deleteTokens,
      });

      const response = await service.confirmEmailChange({
        body: {
          email: 'new@example.com',
          token: 'raw-token',
          userId: '507f1f77bcf86cd799439011',
        },
      });

      expect(response).toEqual({ status: 200, message: 'Email address changed successfully' });
      expect(deps.updateUser).toHaveBeenCalledTimes(1);
      expect(deps.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('surfaces a uniqueness race during the final update', async () => {
      const duplicateError = Object.assign(new Error('duplicate key'), { code: 11000 });
      const { deps, service } = createDeps({
        findToken: jest.fn().mockResolvedValue(await pendingToken()),
        updateUser: jest.fn().mockRejectedValue(duplicateError),
      });

      const response = await service.confirmEmailChange({
        body: {
          email: 'new@example.com',
          token: 'raw-token',
          userId: '507f1f77bcf86cd799439011',
        },
      });

      expect(response).toMatchObject({ status: 409, code: 'email_in_use' });
      expect(deps.sendEmail).not.toHaveBeenCalled();
    });
  });
});
