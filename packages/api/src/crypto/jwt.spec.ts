import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'crypto';
import type { Algorithm, JwtPayload } from 'jsonwebtoken';
import {
  RagScopes,
  isRagAudience,
  getRagAudience,
  supportedRagAlgorithms,
  generateShortLivedToken,
} from './jwt';

const RAG_SECRET = 'rag-secret-that-is-long-enough-for-hs256';
const APP_SECRET = 'app-secret-that-is-long-enough-for-hs256';

const decodeWithRagKey = (token: string): JwtPayload =>
  jwt.verify(token, RAG_SECRET, {
    audience: 'rag_api',
    issuer: 'librechat',
  }) as JwtPayload;

const EC_CURVES: Record<string, string> = {
  ES256: 'prime256v1',
  ES384: 'secp384r1',
  ES512: 'secp521r1',
};

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

const keyPairCache = new Map<string, KeyPair>();

/**
 * A real key of the type the algorithm demands, so the round trip below
 * exercises the signer instead of a stub. An algorithm with no known key type
 * throws rather than being skipped: that is what keeps an unusable entry from
 * sitting in the supported set unexercised.
 */
const keyPairFor = (algorithm: Algorithm): KeyPair => {
  const cached = keyPairCache.get(algorithm);
  if (cached) {
    return cached;
  }

  const publicKeyEncoding = { type: 'spki', format: 'pem' } as const;
  const privateKeyEncoding = { type: 'pkcs8', format: 'pem' } as const;

  const curve = EC_CURVES[algorithm];
  const isRsa = algorithm.startsWith('RS') || algorithm.startsWith('PS');
  if (!curve && !isRsa) {
    throw new Error(`No key type is known for algorithm '${algorithm}'`);
  }

  const pair = curve
    ? generateKeyPairSync('ec', { namedCurve: curve, publicKeyEncoding, privateKeyEncoding })
    : generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding, privateKeyEncoding });

  keyPairCache.set(algorithm, pair);
  return pair;
};

describe('generateShortLivedToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RAG_JWT_SECRET;
    delete process.env.RAG_JWT_PRIVATE_KEY;
    delete process.env.RAG_JWT_ALGORITHM;
    delete process.env.RAG_JWT_ISSUER;
    delete process.env.RAG_JWT_AUDIENCE;
    delete process.env.RAG_JWT_KID;
    delete process.env.RAG_JWT_TTL_SECONDS;
    delete process.env.RAG_AUTH_ACCEPT_LEGACY;
    process.env.JWT_SECRET = APP_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('strict claim set', () => {
    beforeEach(() => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
    });

    it('mints issuer, audience, subject, expiry, tenant, scopes and entities', () => {
      const token = generateShortLivedToken({
        userId: 'user-1',
        tenantId: 'tenant-a',
        entityIds: ['agent_abc'],
        scopes: [RagScopes.embed],
      });

      const claims = decodeWithRagKey(token);
      expect(claims.iss).toBe('librechat');
      expect(claims.aud).toBe('rag_api');
      expect(claims.sub).toBe('user-1');
      expect(claims.tenant).toBe('tenant-a');
      expect(claims.scopes).toEqual(['rag:embed']);
      expect(claims.entities).toEqual(['agent_abc']);
      expect(typeof claims.exp).toBe('number');
    });

    it('omits the entities claim when the call has no entity context', () => {
      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: [],
        scopes: [RagScopes.embed],
      });

      const claims = decodeWithRagKey(token);
      expect(claims).not.toHaveProperty('entities');
      expect(claims).not.toHaveProperty('id');
    });

    it('falls back to the base tenant when the user carries none', () => {
      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: [],
        scopes: [RagScopes.embed],
      });

      expect(decodeWithRagKey(token).tenant).toBe('__BASE__');
    });

    it('drops empty entity ids and de-duplicates scopes', () => {
      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: ['agent_abc', undefined, null, '', 'agent_abc'],
        scopes: [RagScopes.embed, RagScopes.embed],
      });

      const claims = decodeWithRagKey(token);
      expect(claims.entities).toEqual(['agent_abc']);
      expect(claims.scopes).toEqual(['rag:embed']);
    });

    it('honours a configured issuer and audience', () => {
      process.env.RAG_JWT_ISSUER = 'librechat-eu';
      process.env.RAG_JWT_AUDIENCE = 'rag-eu';

      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: [],
        scopes: [RagScopes.rerank],
      });

      const claims = jwt.verify(token, RAG_SECRET, {
        audience: 'rag-eu',
        issuer: 'librechat-eu',
      }) as JwtPayload;
      expect(claims.scopes).toEqual(['rag:rerank']);
    });

    it('refuses to mint a token with no scopes', () => {
      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [] }),
      ).toThrow(/At least one scope is required/);
    });

    it('mints the document scope without any inference scope alongside it', () => {
      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: ['agent_abc'],
        scopes: [RagScopes.documents],
      });

      const claims = decodeWithRagKey(token);
      expect(claims.scopes).toEqual(['rag:documents']);
      expect(claims.entities).toEqual(['agent_abc']);
    });

    it('keeps the document and inference scopes distinct', () => {
      expect(RagScopes.documents).not.toBe(RagScopes.embed);
      expect(RagScopes.documents).not.toBe(RagScopes.rerank);
      expect(new Set(Object.values(RagScopes)).size).toBe(Object.values(RagScopes).length);
    });

    it('refuses to mint a token for the system tenant', () => {
      expect(() =>
        generateShortLivedToken({
          userId: 'user-1',
          tenantId: '__SYSTEM__',
          entityIds: [],
          scopes: [RagScopes.embed],
        }),
      ).toThrow(/system tenant/);
    });

    it('refuses to mint a token with no subject', () => {
      expect(() =>
        generateShortLivedToken({ userId: '', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/user id is required/);
    });
  });

  describe('key separation', () => {
    it('signs with the dedicated key, not the application secret', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;

      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: [],
        scopes: [RagScopes.embed],
      });

      expect(() => jwt.verify(token, APP_SECRET, { audience: 'rag_api' })).toThrow(
        jwt.JsonWebTokenError,
      );
      expect(() => decodeWithRagKey(token)).not.toThrow();
    });

    it('an application session token does not verify against the RAG key', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
      const sessionToken = jwt.sign({ id: 'user-1' }, APP_SECRET, { expiresIn: '5m' });

      expect(() => jwt.verify(sessionToken, RAG_SECRET)).toThrow(jwt.JsonWebTokenError);
    });

    it('refuses a RAG secret identical to the application secret', () => {
      process.env.RAG_JWT_SECRET = APP_SECRET;

      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/must differ from JWT_SECRET/);
    });

    it('refuses a RAG secret shorter than the HMAC minimum', () => {
      process.env.RAG_JWT_SECRET = 'too-short';

      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/at least 32 characters/);
    });
  });

  describe('algorithm support', () => {
    const mint = () =>
      generateShortLivedToken({
        userId: 'user-1',
        tenantId: 'tenant-a',
        entityIds: ['agent_abc'],
        scopes: [RagScopes.documents],
      });

    it.each(supportedRagAlgorithms())(
      'signs and verifies end to end with %s',
      (algorithm: Algorithm) => {
        process.env.RAG_JWT_ALGORITHM = algorithm;

        let verificationKey = RAG_SECRET;
        if (algorithm.startsWith('HS')) {
          process.env.RAG_JWT_SECRET = RAG_SECRET;
        } else {
          const { privateKey, publicKey } = keyPairFor(algorithm);
          process.env.RAG_JWT_PRIVATE_KEY = privateKey;
          verificationKey = publicKey;
        }

        const token = mint();
        const header = jwt.decode(token, { complete: true })?.header;
        expect(header?.alg).toBe(algorithm);

        const claims = jwt.verify(token, verificationKey, {
          algorithms: [algorithm],
          audience: 'rag_api',
          issuer: 'librechat',
        }) as JwtPayload;
        expect(claims.sub).toBe('user-1');
        expect(claims.scopes).toEqual(['rag:documents']);
      },
    );

    it('does not offer EdDSA, which the pinned jsonwebtoken cannot sign', () => {
      expect(supportedRagAlgorithms()).not.toContain('EdDSA');

      process.env.RAG_JWT_ALGORITHM = 'EdDSA';
      process.env.RAG_JWT_PRIVATE_KEY = keyPairFor('RS256').privateKey;

      expect(mint).toThrow(/RAG_JWT_ALGORITHM 'EdDSA' is not supported/);
    });

    it('resolves a supported algorithm whatever case it is configured in', () => {
      process.env.RAG_JWT_ALGORITHM = 'hs384';
      process.env.RAG_JWT_SECRET = RAG_SECRET;

      const token = mint();
      expect(jwt.decode(token, { complete: true })?.header.alg).toBe('HS384');
    });

    it('reports an unsupported algorithm exactly as it was configured', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
      process.env.RAG_JWT_ALGORITHM = 'Ed25519';

      expect(mint).toThrow(/RAG_JWT_ALGORITHM 'Ed25519' is not supported/);
    });
  });

  describe('key id', () => {
    const mint = (userId: string) =>
      generateShortLivedToken({
        userId,
        tenantId: 'tenant-a',
        entityIds: [],
        scopes: [RagScopes.documents],
      });

    it('stamps a default key id so the service can hold more than one key', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;

      const header = jwt.decode(mint('kid-user-1'), { complete: true })?.header;
      expect(header?.kid).toBe('lc-rag-2026-08');
    });

    it('uses a configured key id', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
      process.env.RAG_JWT_KID = 'rag-2027-01';

      expect(jwt.decode(mint('kid-user-2'), { complete: true })?.header.kid).toBe('rag-2027-01');
    });

    it('falls back to the default rather than emitting a blank key id', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
      process.env.RAG_JWT_KID = '   ';

      expect(jwt.decode(mint('kid-user-3'), { complete: true })?.header.kid).toBe('lc-rag-2026-08');
    });

    it('stamps the key id for asymmetric algorithms too', () => {
      process.env.RAG_JWT_ALGORITHM = 'ES256';
      process.env.RAG_JWT_PRIVATE_KEY = keyPairFor('ES256').privateKey;

      expect(jwt.decode(mint('kid-user-4'), { complete: true })?.header.kid).toBe('lc-rag-2026-08');
    });
  });

  describe('replay and validity claims', () => {
    const mint = (userId: string, scope: string = RagScopes.documents) =>
      generateShortLivedToken({
        userId,
        tenantId: 'tenant-a',
        entityIds: [],
        scopes: [scope as (typeof RagScopes)[keyof typeof RagScopes]],
      });

    beforeEach(() => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
    });

    it('carries a token id the service can use as a replay handle', () => {
      const claims = decodeWithRagKey(mint('jti-user-1'));
      expect(typeof claims.jti).toBe('string');
      expect(claims.jti).not.toBe('');
    });

    it('gives distinct claim sets distinct token ids', () => {
      const first = decodeWithRagKey(mint('jti-user-2', RagScopes.documents));
      const second = decodeWithRagKey(mint('jti-user-2', RagScopes.embed));
      expect(first.jti).not.toBe(second.jti);
    });

    it('is valid from the moment it is issued', () => {
      const claims = decodeWithRagKey(mint('nbf-user-1'));
      expect(claims.nbf).toBe(claims.iat);
    });

    it('expires five minutes after issue by default', () => {
      const claims = decodeWithRagKey(mint('ttl-user-1'));
      expect(claims.exp! - claims.iat!).toBe(300);
    });

    it('honours a shorter configured lifetime', () => {
      process.env.RAG_JWT_TTL_SECONDS = '60';

      const claims = decodeWithRagKey(mint('ttl-user-2'));
      expect(claims.exp! - claims.iat!).toBe(60);
    });

    it('refuses to be configured beyond the maximum lifetime', () => {
      process.env.RAG_JWT_TTL_SECONDS = '86400';

      const claims = decodeWithRagKey(mint('ttl-user-3'));
      expect(claims.exp! - claims.iat!).toBe(300);
    });

    it('ignores a lifetime that is not a positive number', () => {
      process.env.RAG_JWT_TTL_SECONDS = 'soon';

      const claims = decodeWithRagKey(mint('ttl-user-4'));
      expect(claims.exp! - claims.iat!).toBe(300);
    });
  });

  describe('mint caching', () => {
    const mint = (overrides: {
      userId?: string;
      tenantId?: string;
      entityIds?: string[];
      scopes?: Array<(typeof RagScopes)[keyof typeof RagScopes]>;
    }) =>
      generateShortLivedToken({
        userId: 'cache-user',
        tenantId: 'tenant-a',
        entityIds: [],
        scopes: [RagScopes.documents],
        ...overrides,
      });

    let now: jest.SpyInstance<number, []>;

    beforeEach(() => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
      now = jest.spyOn(Date, 'now').mockReturnValue(1_778_250_000_000);
    });

    afterEach(() => {
      now.mockRestore();
    });

    it('reuses a token rather than re-signing for an identical call', () => {
      const first = mint({ userId: 'cache-identical' });
      expect(mint({ userId: 'cache-identical' })).toBe(first);
    });

    it('re-signs once the reuse window has passed', () => {
      const first = mint({ userId: 'cache-window' });
      now.mockReturnValue(1_778_250_031_000);
      expect(mint({ userId: 'cache-window' })).not.toBe(first);
    });

    it.each([
      ['user', { userId: 'cache-other-user' }],
      ['tenant', { tenantId: 'tenant-b' }],
      ['scope', { scopes: [RagScopes.embed] }],
      ['entity', { entityIds: ['agent_abc'] }],
    ])('never reuses a token across a different %s', (_label, overrides) => {
      const base = mint({ userId: 'cache-distinct' });
      const other = mint({ userId: 'cache-distinct', ...overrides });
      expect(other).not.toBe(base);
    });

    /**
     * The reused token carries its original `jti`, so the id identifies a token
     * rather than an individual call for as long as it is reused. A fresh mint
     * after the window gets a fresh id.
     */
    it('shares one token id for the reuse window and takes a new one after it', () => {
      const cached = decodeWithRagKey(mint({ userId: 'cache-jti' }));
      const reused = decodeWithRagKey(mint({ userId: 'cache-jti' }));
      expect(reused.jti).toBe(cached.jti);

      now.mockReturnValue(1_778_250_031_000);
      expect(decodeWithRagKey(mint({ userId: 'cache-jti' })).jti).not.toBe(cached.jti);
    });

    it('discards cached tokens when the signing key is rotated', () => {
      const first = mint({ userId: 'cache-rotation' });
      process.env.RAG_JWT_SECRET = `${RAG_SECRET}-rotated`;

      const afterRotation = mint({ userId: 'cache-rotation' });
      expect(afterRotation).not.toBe(first);
      expect(() => decodeWithRagKey(afterRotation)).toThrow();
    });
  });

  describe('private key normalization', () => {
    it('accepts an RSA key supplied as one line with literal \\n escapes', () => {
      const { privateKey, publicKey } = keyPairFor('RS256');
      process.env.RAG_JWT_ALGORITHM = 'RS256';
      process.env.RAG_JWT_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');

      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: [],
        scopes: [RagScopes.embed],
      });

      const claims = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        audience: 'rag_api',
        issuer: 'librechat',
      }) as JwtPayload;
      expect(claims.sub).toBe('user-1');
    });

    it('accepts an EC key supplied as one line with literal \\n escapes', () => {
      const { privateKey, publicKey } = keyPairFor('ES256');
      process.env.RAG_JWT_ALGORITHM = 'ES256';
      process.env.RAG_JWT_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');

      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: [],
        scopes: [RagScopes.embed],
      });

      expect(
        (
          jwt.verify(token, publicKey, {
            algorithms: ['ES256'],
            audience: 'rag_api',
            issuer: 'librechat',
          }) as JwtPayload
        ).sub,
      ).toBe('user-1');
    });

    it('leaves an HMAC secret containing escape sequences byte for byte', () => {
      const secret = 'rag-secret-with-\\n-escape-and-enough-length';
      process.env.RAG_JWT_SECRET = secret;

      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: [],
        scopes: [RagScopes.embed],
      });

      expect(() =>
        jwt.verify(token, secret, { audience: 'rag_api', issuer: 'librechat' }),
      ).not.toThrow();
      expect(() =>
        jwt.verify(token, secret.replace(/\\n/g, '\n'), { audience: 'rag_api' }),
      ).toThrow(jwt.JsonWebTokenError);
    });
  });

  describe('fail-closed configuration', () => {
    it('mints the legacy shape while legacy tokens are still accepted', () => {
      const token = generateShortLivedToken({
        userId: 'user-1',
        entityIds: [],
        scopes: [RagScopes.embed],
      });

      const claims = jwt.verify(token, APP_SECRET) as JwtPayload;
      expect(claims.id).toBe('user-1');
      expect(claims).not.toHaveProperty('aud');
      expect(claims).not.toHaveProperty('scopes');
    });

    it('throws when RAG_JWT_SECRET is unset and legacy tokens are refused', () => {
      process.env.RAG_AUTH_ACCEPT_LEGACY = 'false';

      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/RAG_AUTH_ACCEPT_LEGACY=false requires RAG_JWT_SECRET/);
    });

    it('throws rather than signing with JWT_SECRET when an asymmetric algorithm has no key', () => {
      process.env.RAG_JWT_ALGORITHM = 'RS256';

      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/requires RAG_JWT_PRIVATE_KEY/);
    });

    it('throws on an unsupported algorithm', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
      process.env.RAG_JWT_ALGORITHM = 'none';

      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/is not supported/);
    });

    it('throws when no signing key is configured at all', () => {
      delete process.env.JWT_SECRET;

      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/refusing to mint an unsigned token/);
    });

    it('throws when the configured issuer is blank', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
      process.env.RAG_JWT_ISSUER = '  ';

      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/RAG_JWT_ISSUER must not be empty/);
    });

    it('throws when the configured audience is blank', () => {
      process.env.RAG_JWT_SECRET = RAG_SECRET;
      process.env.RAG_JWT_AUDIENCE = '';

      expect(() =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] }),
      ).toThrow(/RAG_JWT_AUDIENCE must not be empty/);
    });

    it.each([
      ['true', true],
      ['1', true],
      ['yes', true],
      ['on', true],
      ['false', false],
      ['0', false],
      ['no', false],
    ])('reads RAG_AUTH_ACCEPT_LEGACY=%s the same way the service does', (value, accepted) => {
      process.env.RAG_AUTH_ACCEPT_LEGACY = value;

      const mint = () =>
        generateShortLivedToken({ userId: 'user-1', entityIds: [], scopes: [RagScopes.embed] });

      if (accepted) {
        expect(mint).not.toThrow();
      } else {
        expect(mint).toThrow(/requires RAG_JWT_SECRET/);
      }
    });
  });
});

describe('isRagAudience', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RAG_JWT_AUDIENCE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('recognises the default audience', () => {
    expect(isRagAudience('rag_api')).toBe(true);
  });

  it('recognises a configured audience', () => {
    process.env.RAG_JWT_AUDIENCE = 'rag-eu';
    expect(isRagAudience('rag-eu')).toBe(true);
    expect(isRagAudience('rag_api')).toBe(false);
  });

  it('recognises the audience inside a list', () => {
    expect(isRagAudience(['other', 'rag_api'])).toBe(true);
  });

  it('ignores tokens with no audience', () => {
    expect(isRagAudience(undefined)).toBe(false);
    expect(isRagAudience(null)).toBe(false);
    expect(isRagAudience([])).toBe(false);
  });

  it('keeps the default audience when configuration is blank', () => {
    process.env.RAG_JWT_AUDIENCE = '   ';
    expect(getRagAudience()).toBe('rag_api');
    expect(isRagAudience('rag_api')).toBe(true);
  });
});
