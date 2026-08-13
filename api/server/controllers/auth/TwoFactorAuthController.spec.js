const jwt = require('jsonwebtoken');

const mockSetAuthTokens = jest.fn(() => Promise.resolve('auth-token'));
const mockDeleteAllUserSessions = jest.fn(() => Promise.resolve({ deletedCount: 0 }));
const mockGetTOTPSecret = jest.fn();
const mockVerifyTOTP = jest.fn();
const mockVerifyBackupCode = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { error: jest.fn() },
}));

jest.mock('~/server/services/twoFactorService', () => ({
  getTOTPSecret: (...args) => mockGetTOTPSecret(...args),
  verifyTOTP: (...args) => mockVerifyTOTP(...args),
  verifyBackupCode: (...args) => mockVerifyBackupCode(...args),
  generateBackupCodes: (...args) => store.generateBackupCodes(...args),
}));

jest.mock('~/server/services/AuthService', () => ({
  setAuthTokens: (...args) => mockSetAuthTokens(...args),
}));

jest.mock('~/models', () => ({
  getUserById: (...args) => store.getUserById(...args),
  updateTwoFactorEnrollment: (...args) => store.updateTwoFactorEnrollment(...args),
  deleteAllUserSessions: (...args) => mockDeleteAllUserSessions(...args),
}));

const ELIGIBLE_PROVIDERS = new Set(['local', 'ldap']);

/**
 * Minimal in-memory user store with the same compare-and-swap semantics as the Mongo-backed
 * `updateTwoFactorEnrollment`, so the controller chain is exercised against real lifecycle state.
 */
const store = {
  doc: null,
  codeCounter: 0,
  reset(overrides = {}) {
    this.codeCounter = 0;
    this.doc = {
      _id: 'user-1',
      email: 'user@example.com',
      password: 'password-hash',
      provider: 'local',
      /**
       * These queries select with `+field` tokens only, which leaves Mongoose no projection to
       * send, so the stored document arrives whole. The session records ride along with it.
       */
      refreshToken: [{ refreshToken: 'live-session-token' }],
      twoFactorEnabled: false,
      totpSecret: null,
      backupCodes: [],
      pendingTotpSecret: 'encrypted-secret',
      pendingBackupCodes: [{ codeHash: 'staged-hash', used: false }],
      twoFactorAcknowledgementNonceHash: null,
      twoFactorFinalizationNonceHash: null,
      ...overrides,
    };
  },
  async getUserById() {
    return this.doc ? { ...this.doc } : null;
  },
  async generateBackupCodes() {
    this.codeCounter += 1;
    return {
      plainCodes: [`plain-${this.codeCounter}`],
      codeObjects: [{ codeHash: `hash-${this.codeCounter}`, used: false, usedAt: null }],
    };
  },
  async updateTwoFactorEnrollment(_userId, guard, update) {
    if (this.doc.twoFactorEnabled) {
      return null;
    }
    if (this.doc.provider != null && !ELIGIBLE_PROVIDERS.has(this.doc.provider)) {
      return null;
    }
    const matches = Object.entries(guard).every(
      ([key, value]) => JSON.stringify(this.doc[key] ?? null) === JSON.stringify(value ?? null),
    );
    if (!matches) {
      return null;
    }
    this.doc = { ...this.doc, ...update };
    return { ...this.doc };
  },
};

const {
  verify2FAWithTempToken,
  confirm2FASetupWithTempToken,
  acknowledge2FASetup,
  finalize2FASetup,
} = require('./TwoFactorAuthController');
const {
  verifyTwoFactorSetupAcknowledgementToken,
  verifyTwoFactorSetupFinalizationToken,
} = require('@librechat/api');

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

/** Drives the request pipeline the routes wire up: credential validation, then the controller. */
async function runAcknowledge(acknowledgementToken) {
  const credential = verifyTwoFactorSetupAcknowledgementToken(
    acknowledgementToken,
    process.env.JWT_SECRET,
  );
  const req = {
    user: credential ? { id: credential.userId } : undefined,
    twoFactorEnrollmentNonce: credential?.nonce,
    body: { acknowledgementToken },
  };
  const res = createResponse();
  await acknowledge2FASetup(req, res);
  return res;
}

async function runFinalize(finalizationToken) {
  const credential = verifyTwoFactorSetupFinalizationToken(
    finalizationToken,
    process.env.JWT_SECRET,
  );
  const req = {
    user: credential ? { id: credential.userId } : undefined,
    twoFactorEnrollmentNonce: credential?.nonce,
    body: { finalizationToken },
  };
  const res = createResponse();
  await finalize2FASetup(req, res);
  return res;
}

async function runConfirm(token = '123456') {
  const req = { user: { id: 'user-1' }, body: { token } };
  const res = createResponse();
  await confirm2FASetupWithTempToken(req, res);
  return res;
}

const jsonPayload = (res) => res.json.mock.calls[0][0];

const originalSecret = process.env.JWT_SECRET;
const originalPolicy = process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'jwt-secret';
  process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = 'true';
  mockGetTOTPSecret.mockResolvedValue('plain-secret');
  mockVerifyTOTP.mockResolvedValue(true);
  store.reset();
});

afterAll(() => {
  if (originalSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalSecret;
  }
  if (originalPolicy === undefined) {
    delete process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION;
  } else {
    process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = originalPolicy;
  }
});

describe('verify2FAWithTempToken', () => {
  beforeEach(() => {
    store.reset({ twoFactorEnabled: true, totpSecret: 'encrypted-secret' });
  });

  it('accepts a normal login challenge token and creates the app session', async () => {
    const tempToken = jwt.sign(
      { userId: 'user-1', purpose: 'login_2fa_challenge' },
      process.env.JWT_SECRET,
    );
    const req = { body: { tempToken, token: '123456' } };
    const res = createResponse();

    await verify2FAWithTempToken(req, res);

    expect(mockSetAuthTokens).toHaveBeenCalledWith('user-1', res, null, req);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([
    'required_2fa_setup',
    'required_2fa_acknowledgement',
    'required_2fa_finalization',
    undefined,
  ])('rejects a %s token before creating a session', async (purpose) => {
    const claims = purpose
      ? { userId: 'user-1', purpose, nonce: 'nonce' }
      : { userId: 'user-1', nonce: 'nonce' };
    const tempToken = jwt.sign(claims, process.env.JWT_SECRET);
    const res = createResponse();

    await verify2FAWithTempToken({ body: { tempToken, token: '123456' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('strips every secret and enrollment nonce from the session response', async () => {
    const tempToken = jwt.sign(
      { userId: 'user-1', purpose: 'login_2fa_challenge' },
      process.env.JWT_SECRET,
    );
    const res = createResponse();

    await verify2FAWithTempToken({ body: { tempToken, token: '123456' } }, res);

    expect(jsonPayload(res).user).toEqual({
      _id: 'user-1',
      id: 'user-1',
      email: 'user@example.com',
      provider: 'local',
      twoFactorEnabled: true,
    });
  });
});

describe('confirm2FASetupWithTempToken', () => {
  it('returns deliverable codes and an acknowledgement credential without a session', async () => {
    const res = await runConfirm();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(jsonPayload(res).backupCodes).toEqual(['plain-1']);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(store.doc.twoFactorEnabled).toBe(false);
    expect(store.doc.totpSecret).toBeNull();
    expect(store.doc.pendingBackupCodes).toEqual([
      { codeHash: 'hash-1', used: false, usedAt: null },
    ]);
    expect(
      verifyTwoFactorSetupAcknowledgementToken(
        jsonPayload(res).acknowledgementToken,
        process.env.JWT_SECRET,
      ),
    ).toEqual({ userId: 'user-1', nonce: expect.any(String) });
  });

  it('is retryable after a lost response, rotating codes and retiring the old credential', async () => {
    const first = await runConfirm();
    const second = await runConfirm();

    expect(jsonPayload(second).backupCodes).toEqual(['plain-2']);
    expect(jsonPayload(second).acknowledgementToken).not.toBe(
      jsonPayload(first).acknowledgementToken,
    );

    const staleAcknowledgement = await runAcknowledge(jsonPayload(first).acknowledgementToken);

    expect(staleAcknowledgement.status).toHaveBeenCalledWith(400);
    expect(store.doc.twoFactorEnabled).toBe(false);
  });

  it('does not issue auth tokens when the TOTP is wrong', async () => {
    mockVerifyTOTP.mockResolvedValue(false);

    const res = await runConfirm('000000');

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(store.doc.twoFactorAcknowledgementNonceHash).toBeNull();
  });

  it('rejects requests without a validated setup user', async () => {
    const res = createResponse();

    await confirm2FASetupWithTempToken({ body: { token: '123456' } }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });
});

describe('acknowledge2FASetup', () => {
  it('exchanges a one-time acknowledgement nonce for a finalization credential', async () => {
    const confirmed = await runConfirm();

    const res = await runAcknowledge(jsonPayload(confirmed).acknowledgementToken);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
    expect(store.doc.twoFactorEnabled).toBe(false);
    expect(store.doc.twoFactorAcknowledgementNonceHash).toBeNull();
    expect(
      verifyTwoFactorSetupFinalizationToken(
        jsonPayload(res).finalizationToken,
        process.env.JWT_SECRET,
      ),
    ).toEqual({ userId: 'user-1', nonce: expect.any(String) });
  });

  it('rejects a replayed acknowledgement credential without minting anything', async () => {
    const confirmed = await runConfirm();
    await runAcknowledge(jsonPayload(confirmed).acknowledgementToken);

    const replay = await runAcknowledge(jsonPayload(confirmed).acknowledgementToken);

    expect(replay.status).toHaveBeenCalledWith(400);
    expect(jsonPayload(replay)).not.toHaveProperty('finalizationToken');
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects acknowledgement without a validated identity', async () => {
    const res = createResponse();

    await acknowledge2FASetup({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });
});

describe('finalize2FASetup', () => {
  async function reachFinalization() {
    const confirmed = await runConfirm();
    const acknowledged = await runAcknowledge(jsonPayload(confirmed).acknowledgementToken);
    return jsonPayload(acknowledged).finalizationToken;
  }

  it.each(['local', 'ldap', undefined])(
    'promotes an eligible %s enrollment and only then creates the session',
    async (provider) => {
      store.reset({ provider });
      const finalizationToken = await reachFinalization();

      expect(mockSetAuthTokens).not.toHaveBeenCalled();

      const res = await runFinalize(finalizationToken);

      expect(mockSetAuthTokens).toHaveBeenCalledWith('user-1', res, null, expect.any(Object));
      expect(store.doc).toMatchObject({
        twoFactorEnabled: true,
        totpSecret: 'encrypted-secret',
        pendingTotpSecret: null,
        pendingBackupCodes: [],
        twoFactorAcknowledgementNonceHash: null,
        twoFactorFinalizationNonceHash: null,
        /** Dates the tokens issued before enrollment, so it is stamped but never published. */
        twoFactorEnrolledAt: expect.any(Date),
      });
      expect(jsonPayload(res)).toEqual({
        token: 'auth-token',
        user: {
          _id: 'user-1',
          id: 'user-1',
          email: 'user@example.com',
          provider,
          twoFactorEnabled: true,
        },
      });
    },
  );

  it('revokes pre-enrollment sessions before minting the enrolled one', async () => {
    const finalizationToken = await reachFinalization();

    await runFinalize(finalizationToken);

    expect(mockDeleteAllUserSessions).toHaveBeenCalledWith({ userId: 'user-1' });
    /** Revoking after minting would drop the session this response hands back. */
    expect(mockDeleteAllUserSessions.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetAuthTokens.mock.invocationCallOrder[0],
    );
  });

  it('leaves existing sessions alone when finalization is rejected', async () => {
    const finalizationToken = await reachFinalization();
    store.doc.pendingTotpSecret = null;

    const res = await runFinalize(finalizationToken);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDeleteAllUserSessions).not.toHaveBeenCalled();
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects a replayed finalization credential without a second session', async () => {
    const finalizationToken = await reachFinalization();
    await runFinalize(finalizationToken);
    mockSetAuthTokens.mockClear();

    const replay = await runFinalize(finalizationToken);

    expect(replay.status).toHaveBeenCalledWith(400);
    expect(jsonPayload(replay)).not.toHaveProperty('token');
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects a finalization credential retired by a later confirmation', async () => {
    const finalizationToken = await reachFinalization();
    await runConfirm();

    const res = await runFinalize(finalizationToken);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(store.doc.twoFactorEnabled).toBe(false);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects a user whose provider becomes federated before finalization', async () => {
    const finalizationToken = await reachFinalization();
    store.doc.provider = 'openid';

    const res = await runFinalize(finalizationToken);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(store.doc.twoFactorEnabled).toBe(false);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects finalization when global enforcement is disabled', async () => {
    const finalizationToken = await reachFinalization();
    process.env.ENFORCE_TWO_FACTOR_AUTHENTICATION = 'false';

    const res = await runFinalize(finalizationToken);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(store.doc.twoFactorEnabled).toBe(false);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects finalization once the pending setup has been cleared', async () => {
    const finalizationToken = await reachFinalization();
    store.doc.pendingTotpSecret = null;
    store.doc.pendingBackupCodes = [];

    const res = await runFinalize(finalizationToken);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('rejects finalization without a validated identity', async () => {
    const res = createResponse();

    await finalize2FASetup({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSetAuthTokens).not.toHaveBeenCalled();
  });

  it('never leaks secrets or enrollment nonces in the session response', async () => {
    const finalizationToken = await reachFinalization();

    const res = await runFinalize(finalizationToken);
    const { user } = jsonPayload(res);

    for (const field of [
      'password',
      'totpSecret',
      'backupCodes',
      'refreshToken',
      'pendingTotpSecret',
      'pendingBackupCodes',
      'twoFactorAcknowledgementNonceHash',
      'twoFactorFinalizationNonceHash',
    ]) {
      expect(user).not.toHaveProperty(field);
    }
  });

  /**
   * Naming the secrets one by one only ever catches the secrets already thought of, and this
   * response is built from an unprojected document. Pinning the whole shape is what keeps a field
   * added to the schema later from arriving here unannounced.
   */
  it('sends only allowlisted fields in the session response', async () => {
    const finalizationToken = await reachFinalization();

    const res = await runFinalize(finalizationToken);

    expect(jsonPayload(res).user).toEqual({
      _id: 'user-1',
      id: 'user-1',
      email: 'user@example.com',
      provider: 'local',
      twoFactorEnabled: true,
    });
  });
});
