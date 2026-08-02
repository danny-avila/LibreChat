import {
  authenticationChallengeKey,
  consumeChallenge,
  createPasskeyAuthenticationOptions,
  createPasskeyRegistrationOptions,
  defaultPasskeyName,
  getPasskeyConfig,
  isPasskeyEnabled,
  registrationChallengeKey,
  verifyPasskeyAuthentication,
  verifyPasskeyRegistration,
} from './passkey';

import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { PasskeyChallengeStore, PasskeyConfig } from './passkey';

/** In-memory stand-in for the app's Keyv challenge store. */
function createStore(): PasskeyChallengeStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    get: async (key) => entries.get(key),
    set: async (key, value) => entries.set(key, value),
    delete: async (key) => entries.delete(key),
  };
}

const config: PasskeyConfig = {
  enabled: true,
  rpID: 'chat.example.com',
  rpName: 'LibreChat',
  origins: ['https://chat.example.com'],
};

const user = { id: '65f0000000000000000000aa', email: 'user@example.com', name: 'Ada' };

describe('getPasskeyConfig', () => {
  it('derives the RP ID and origins from DOMAIN_CLIENT', () => {
    const resolved = getPasskeyConfig({
      ALLOW_PASSKEY_LOGIN: 'true',
      DOMAIN_CLIENT: 'https://chat.example.com',
      DOMAIN_SERVER: 'https://chat.example.com',
      APP_TITLE: 'Acme Chat',
    } as NodeJS.ProcessEnv);

    expect(resolved.enabled).toBe(true);
    expect(resolved.rpID).toBe('chat.example.com');
    expect(resolved.rpName).toBe('Acme Chat');
    expect(resolved.origins).toEqual(['https://chat.example.com']);
  });

  it('keeps a distinct server origin alongside the client origin', () => {
    const resolved = getPasskeyConfig({
      ALLOW_PASSKEY_LOGIN: 'true',
      DOMAIN_CLIENT: 'https://chat.example.com',
      DOMAIN_SERVER: 'https://api.example.com',
    } as NodeJS.ProcessEnv);

    expect(resolved.origins).toEqual(['https://chat.example.com', 'https://api.example.com']);
  });

  it('prefers explicit overrides and ignores unparseable origins', () => {
    const resolved = getPasskeyConfig({
      ALLOW_PASSKEY_LOGIN: 'true',
      DOMAIN_CLIENT: 'https://chat.example.com',
      PASSKEY_RP_ID: 'example.com',
      PASSKEY_RP_NAME: 'Custom',
      PASSKEY_ORIGINS: 'https://a.example.com, not-a-url ,https://b.example.com',
    } as NodeJS.ProcessEnv);

    expect(resolved.rpID).toBe('example.com');
    expect(resolved.rpName).toBe('Custom');
    expect(resolved.origins).toEqual(['https://a.example.com', 'https://b.example.com']);
  });

  it('is disabled unless ALLOW_PASSKEY_LOGIN is truthy', () => {
    const resolved = getPasskeyConfig({
      DOMAIN_CLIENT: 'https://chat.example.com',
    } as NodeJS.ProcessEnv);

    expect(resolved.enabled).toBe(false);
    expect(isPasskeyEnabled(resolved)).toBe(false);
  });

  it('reports disabled when no origin can be resolved', () => {
    expect(isPasskeyEnabled({ ...config, origins: [] })).toBe(false);
  });
});

describe('consumeChallenge', () => {
  it('returns the challenge once and invalidates it', async () => {
    const store = createStore();
    await store.set('key', 'challenge-value');

    expect(await consumeChallenge(store, 'key')).toBe('challenge-value');
    expect(await consumeChallenge(store, 'key')).toBeUndefined();
  });

  it('returns undefined for an unknown key', async () => {
    expect(await consumeChallenge(createStore(), 'missing')).toBeUndefined();
  });
});

describe('createPasskeyRegistrationOptions', () => {
  it('stores the challenge under the user and excludes known credentials', async () => {
    const store = createStore();
    const options = await createPasskeyRegistrationOptions({
      config,
      store,
      user,
      existingCredentials: [
        { credentialId: 'abc', publicKey: Buffer.alloc(1), counter: 0, transports: ['internal'] },
      ],
    });

    expect(options.rp).toEqual({ id: config.rpID, name: config.rpName });
    expect(options.user.name).toBe(user.email);
    expect(options.user.displayName).toBe('Ada');
    expect(options.excludeCredentials).toEqual([
      { id: 'abc', type: 'public-key', transports: ['internal'] },
    ]);
    /** Discoverable credentials are what make usernameless sign-in possible. */
    expect(options.authenticatorSelection?.residentKey).toBe('required');
    expect(store.entries.get(registrationChallengeKey(user.id))).toBe(options.challenge);
  });
});

describe('createPasskeyAuthenticationOptions', () => {
  it('omits allowCredentials so the response does not reveal account existence', async () => {
    const store = createStore();
    const { options, sessionId } = await createPasskeyAuthenticationOptions({ config, store });

    expect(options.allowCredentials).toBeUndefined();
    expect(options.rpId).toBe(config.rpID);
    expect(store.entries.get(authenticationChallengeKey(sessionId))).toBe(options.challenge);
  });

  it('issues a distinct session handle per ceremony', async () => {
    const store = createStore();
    const first = await createPasskeyAuthenticationOptions({ config, store });
    const second = await createPasskeyAuthenticationOptions({ config, store });

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(store.entries.size).toBe(2);
  });
});

describe('verification without a live challenge', () => {
  const registrationResponse = {
    id: 'cred-id',
    rawId: 'cred-id',
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON: '', attestationObject: '' },
  } as RegistrationResponseJSON;

  const authenticationResponse = {
    id: 'cred-id',
    rawId: 'cred-id',
    type: 'public-key',
    clientExtensionResults: {},
    response: { clientDataJSON: '', authenticatorData: '', signature: '' },
  } as AuthenticationResponseJSON;

  it('rejects a registration with no pending challenge', async () => {
    const result = await verifyPasskeyRegistration({
      config,
      store: createStore(),
      userId: user.id,
      response: registrationResponse,
    });

    expect(result).toBeNull();
  });

  it('rejects a replayed registration challenge', async () => {
    const store = createStore();
    await createPasskeyRegistrationOptions({ config, store, user });

    /** The first attempt consumes the challenge even though the payload is bogus. */
    expect(
      await verifyPasskeyRegistration({
        config,
        store,
        userId: user.id,
        response: registrationResponse,
      }),
    ).toBeNull();
    expect(store.entries.has(registrationChallengeKey(user.id))).toBe(false);
  });

  it('rejects an assertion with an unknown session handle', async () => {
    const result = await verifyPasskeyAuthentication({
      config,
      store: createStore(),
      sessionId: 'never-issued',
      response: authenticationResponse,
      credential: { credentialId: 'cred-id', publicKey: Buffer.alloc(1), counter: 0 },
    });

    expect(result).toBeNull();
  });

  it('rejects a tampered assertion and burns the challenge', async () => {
    const store = createStore();
    const { sessionId } = await createPasskeyAuthenticationOptions({ config, store });

    const result = await verifyPasskeyAuthentication({
      config,
      store,
      sessionId,
      response: authenticationResponse,
      credential: { credentialId: 'cred-id', publicKey: Buffer.alloc(1), counter: 0 },
    });

    expect(result).toBeNull();
    expect(store.entries.has(authenticationChallengeKey(sessionId))).toBe(false);
  });
});

describe('defaultPasskeyName', () => {
  it.each([
    [['hybrid'], 'Phone or tablet'],
    [['usb'], 'Security key'],
    [['nfc'], 'Security key'],
    [['internal'], 'This device'],
    [[], 'Passkey'],
  ])('labels %p as %s', (transports, expected) => {
    expect(defaultPasskeyName(transports)).toBe(expected);
  });
});
