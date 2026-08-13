import { createSign, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import {
  CLERK_CLOCK_SKEW_MS,
  MAX_CLERK_TOKEN_LIFETIME_MS,
  verifyClerkSessionToken,
} from './verify';
import { recordClerkTokenVerification } from '../../app/metrics';

jest.mock('../../app/metrics', () => ({
  recordClerkTokenVerification: jest.fn(),
}));

const recordClerkTokenVerificationMock = jest.mocked(recordClerkTokenVerification);

const NOW = new Date('2026-08-13T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const AUTHORIZED_PARTY = 'https://chat.example.com';

const signingKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const otherSigningKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicKey = signingKeys.publicKey.export({ format: 'pem', type: 'spki' }).toString();

const config = {
  enabled: true as const,
  publishableKey: 'pk_test_public',
  secretKey: 'sk_test_secret',
  jwtKey: publicKey,
  authorizedParties: [AUTHORIZED_PARTY] as readonly string[],
  webhookSigningSecret: 'whsec_test',
};

const baseClaims: Record<string, unknown> = {
  sub: 'user_123',
  sid: 'sess_123',
  jti: 'token_123',
  azp: AUTHORIZED_PARTY,
  iss: 'https://clerk.example.test',
  iat: NOW_SECONDS - 30,
  exp: NOW_SECONDS + 300,
};

function signToken(
  overrides: Record<string, unknown> = {},
  privateKey: KeyObject = signingKeys.privateKey,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ...baseClaims, ...overrides })).toString(
    'base64url',
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${signature.toString('base64url')}`;
}

describe('verifyClerkSessionToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('verifies a locally signed session token into the internal identity contract', async () => {
    const identity = await verifyClerkSessionToken(signToken(), config);

    expect(identity).toEqual({
      clerkId: 'user_123',
      clerkSessionId: 'sess_123',
      clerkTokenId: 'token_123',
      authorizedParty: AUTHORIZED_PARTY,
      tokenIssuedAt: new Date((NOW_SECONDS - 30) * 1_000),
      tokenExpiresAt: new Date((NOW_SECONDS + 300) * 1_000),
    });
    expect(recordClerkTokenVerificationMock).toHaveBeenCalledWith('success', expect.any(Number));
  });

  it('accepts default Clerk session tokens without an audience claim', async () => {
    await expect(verifyClerkSessionToken(signToken({ aud: undefined }), config)).resolves.toEqual(
      expect.objectContaining({ clerkId: 'user_123' }),
    );
  });

  it('ignores email-shaped custom claims from the session token', async () => {
    const identity = await verifyClerkSessionToken(
      signToken({ email: 'attacker@example.com', email_verified: true }),
      config,
    );

    expect(identity).not.toHaveProperty('email');
    expect(identity).not.toHaveProperty('emailVerified');
  });

  it.each([
    ['sub', undefined],
    ['sub', '   '],
    ['sid', undefined],
    ['sid', '   '],
    ['jti', undefined],
    ['jti', '   '],
    ['azp', undefined],
    ['azp', '   '],
    ['iat', undefined],
    ['iat', 'not-a-number'],
    ['exp', undefined],
    ['exp', 'not-a-number'],
    ['iss', undefined],
    ['iss', '   '],
  ])('rejects a missing or malformed %s claim', async (claim, value) => {
    await expect(
      verifyClerkSessionToken(signToken({ [claim]: value }), config),
    ).rejects.toMatchObject({
      code: 'CLERK_TOKEN_INVALID',
      status: 401,
    });
  });

  it('rejects a token from a disallowed authorized party', async () => {
    await expect(
      verifyClerkSessionToken(signToken({ azp: 'https://evil.example.com' }), config),
    ).rejects.toMatchObject({ code: 'CLERK_TOKEN_INVALID', status: 401 });
  });

  it('rejects a pending Clerk session', async () => {
    await expect(
      verifyClerkSessionToken(signToken({ sts: 'pending' }), config),
    ).rejects.toMatchObject({ code: 'CLERK_TOKEN_INVALID', status: 401 });
  });

  it('accepts a non-pending Clerk session status', async () => {
    await expect(verifyClerkSessionToken(signToken({ sts: 'active' }), config)).resolves.toEqual(
      expect.objectContaining({ clerkSessionId: 'sess_123' }),
    );
  });

  it('rejects a token whose issued-at and expiry claims are not ordered', async () => {
    await expect(
      verifyClerkSessionToken(signToken({ iat: NOW_SECONDS + 60, exp: NOW_SECONDS + 60 }), config),
    ).rejects.toMatchObject({ code: 'CLERK_TOKEN_INVALID', status: 401 });
  });

  it('rejects a token whose declared lifetime exceeds fifteen minutes', async () => {
    const issuedAt = NOW_SECONDS - 30;
    const expiresAt = issuedAt + MAX_CLERK_TOKEN_LIFETIME_MS / 1_000 + 1;

    await expect(
      verifyClerkSessionToken(signToken({ iat: issuedAt, exp: expiresAt }), config),
    ).rejects.toMatchObject({ code: 'CLERK_TOKEN_INVALID', status: 401 });
  });

  it('rejects an expired token outside the named clock-skew tolerance', async () => {
    const expiresAt = NOW_SECONDS - Math.ceil(clerkClockSkewSeconds()) - 1;

    await expect(
      verifyClerkSessionToken(signToken({ iat: expiresAt - 300, exp: expiresAt }), config),
    ).rejects.toMatchObject({ code: 'CLERK_TOKEN_INVALID', status: 401 });
  });

  it('rejects a token signed by a different key', async () => {
    await expect(
      verifyClerkSessionToken(signToken({}, otherSigningKeys.privateKey), config),
    ).rejects.toMatchObject({ code: 'CLERK_TOKEN_INVALID', status: 401 });
    expect(recordClerkTokenVerificationMock).toHaveBeenCalledWith('invalid', expect.any(Number));
  });
});

function clerkClockSkewSeconds(): number {
  return CLERK_CLOCK_SKEW_MS / 1_000;
}
