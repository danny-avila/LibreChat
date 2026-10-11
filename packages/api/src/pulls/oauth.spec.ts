import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { PullRequestOAuthConfig } from './settings';
import type { PullRequestOAuthStore } from './oauth';
import { createPullRequestOAuth, oauthEndpoints, PULL_REQUEST_OAUTH_TYPE } from './oauth';

const secret = 'test-secret';
const redirectUri = 'https://chat.example.com/api/pull-requests/oauth/callback';
const github: PullRequestOAuthConfig = {
  provider: 'github',
  host: 'github.com',
  clientId: 'client-1',
  clientSecret: 'client-secret',
};
const gitlab: PullRequestOAuthConfig = {
  provider: 'gitlab',
  host: 'gitlab.example.com',
  clientId: 'gl-client',
  clientSecret: 'gl-secret',
};
/** Reversible, and never the plaintext, so a test can see what was stored and that it was hidden. */
const encrypt = async (value: string) => `enc:${Buffer.from(value).toString('base64')}`;
const decrypt = async (value: string) =>
  Buffer.from(value.replace(/^enc:/, ''), 'base64').toString('utf8');

let mongoServer: MongoMemoryServer;
let store: PullRequestOAuthStore;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  store = createMethods(mongoose) as unknown as PullRequestOAuthStore;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.db?.collection('tokens').deleteMany({});
});

const userId = () => new mongoose.Types.ObjectId().toString();
const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);

function setup(responses: Array<() => Response>, now = () => Date.now()) {
  const fetchFn = jest.fn(async (_input: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (next == null) throw new Error('unexpected request');
    return next();
  });
  const oauth = createPullRequestOAuth({
    store,
    fetchFn,
    secret,
    redirectUri,
    encrypt,
    decrypt,
    now,
  });
  return { oauth, fetchFn };
}

const formOf = (init: RequestInit | undefined) => new URLSearchParams(String(init?.body));

async function connect(
  oauth: ReturnType<typeof setup>['oauth'],
  user: string,
  config = github,
): Promise<void> {
  const { url } = oauth.authorizationUrl({ id: user }, config);
  const state = new URL(url).searchParams.get('state') ?? '';
  const claims = oauth.verifyState(state);
  if (claims == null) throw new Error('state did not verify');
  await oauth.complete(claims, 'the-code', config);
}

describe('oauthEndpoints', () => {
  it.each([
    ['github', 'github.com', 'https://github.com/login/oauth/authorize'],
    ['github', 'ghe.example.com', 'https://ghe.example.com/login/oauth/authorize'],
    ['gitlab', 'gitlab.example.com', 'https://gitlab.example.com/oauth/authorize'],
    ['bitbucket', 'bitbucket.org', 'https://bitbucket.org/site/oauth2/authorize'],
  ] as const)('authorizes %s on %s at %s', (provider, host, authorize) => {
    expect(oauthEndpoints(provider, host).authorize).toBe(authorize);
  });
});

describe('authorizationUrl and verifyState', () => {
  it('sends the user to the provider with a signed state and an S256 challenge', () => {
    const { oauth } = setup([]);
    const { url, flowId } = oauth.authorizationUrl({ id: 'u1', tenantId: 't1' }, gitlab);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://gitlab.example.com/oauth/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('gl-client');
    expect(parsed.searchParams.get('redirect_uri')).toBe(redirectUri);
    expect(parsed.searchParams.get('scope')).toBe('read_api');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('client_secret')).toBeNull();
    const claims = oauth.verifyState(parsed.searchParams.get('state') ?? '');
    expect(claims).toMatchObject({
      userId: 'u1',
      provider: 'gitlab',
      host: 'gitlab.example.com',
      tenantId: 't1',
      flowId,
    });
  });

  it('asks GitHub for no scope unless one is configured', () => {
    const { oauth } = setup([]);
    expect(
      new URL(oauth.authorizationUrl({ id: 'u1' }, github).url).searchParams.has('scope'),
    ).toBe(false);
    const scoped = oauth.authorizationUrl({ id: 'u1' }, { ...github, scope: 'repo' });
    expect(new URL(scoped.url).searchParams.get('scope')).toBe('repo');
  });

  it('starts a new flow each time', () => {
    const { oauth } = setup([]);
    const first = oauth.authorizationUrl({ id: 'u1' }, github);
    const second = oauth.authorizationUrl({ id: 'u1' }, github);
    expect(first.flowId).not.toBe(second.flowId);
  });

  it.each([
    ['garbage', 'not-a-token'],
    ['another secret', jwt.sign({ sub: 'u1', p: 'github', h: 'github.com', n: 'x' }, 'other')],
    [
      'another audience',
      jwt.sign({ sub: 'u1', p: 'github', h: 'github.com', n: 'x' }, secret, { audience: 'x' }),
    ],
    [
      'an expired state',
      jwt.sign({ sub: 'u1', p: 'github', h: 'github.com', n: 'x' }, secret, {
        audience: 'librechat:pull-request-oauth',
        expiresIn: -1,
      }),
    ],
    [
      'an unknown provider',
      jwt.sign({ sub: 'u1', p: 'gitea', h: 'x', n: 'x' }, secret, {
        audience: 'librechat:pull-request-oauth',
      }),
    ],
  ])('refuses %s', (_label, state) => {
    const { oauth } = setup([]);
    expect(oauth.verifyState(state)).toBeNull();
  });
});

describe('complete', () => {
  it('exchanges the code with the verifier behind the challenge and stores the grant encrypted', async () => {
    const { oauth, fetchFn } = setup([
      () => json({ access_token: 'gho_access', token_type: 'bearer' }),
    ]);
    const user = userId();
    const { url } = oauth.authorizationUrl({ id: user }, github);
    const challenge = new URL(url).searchParams.get('code_challenge');
    const claims = oauth.verifyState(new URL(url).searchParams.get('state') ?? '');
    await oauth.complete(claims!, 'the-code', github);

    const [endpoint, init] = fetchFn.mock.calls[0];
    expect(endpoint).toBe('https://github.com/login/oauth/access_token');
    const form = formOf(init);
    expect(form.get('code')).toBe('the-code');
    expect(form.get('redirect_uri')).toBe(redirectUri);
    expect(form.get('client_secret')).toBe('client-secret');
    const verifier = form.get('code_verifier') ?? '';
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);

    const row = await mongoose.connection
      .db!.collection('tokens')
      .findOne({ type: PULL_REQUEST_OAUTH_TYPE });
    expect(row?.identifier).toBe('github:github.com');
    expect(String(row?.token)).not.toContain('gho_access');
    await expect(oauth.token(user, github)).resolves.toBe('gho_access');
  });

  it('authenticates to Bitbucket with Basic credentials, not in the form', async () => {
    const bitbucket: PullRequestOAuthConfig = {
      ...github,
      provider: 'bitbucket',
      host: 'bitbucket.org',
    };
    const { oauth, fetchFn } = setup([() => json({ access_token: 'bb', expires_in: 7200 })]);
    await connect(oauth, userId(), bitbucket);
    const init = fetchFn.mock.calls[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('client-1:client-secret').toString('base64')}`,
    );
    expect(formOf(init).has('client_secret')).toBe(false);
  });

  it('replaces an earlier connection of the same user', async () => {
    const { oauth } = setup([
      () => json({ access_token: 'first' }),
      () => json({ access_token: 'second' }),
    ]);
    const user = userId();
    await connect(oauth, user);
    await connect(oauth, user);
    await expect(oauth.token(user, github)).resolves.toBe('second');
    expect(
      await mongoose.connection
        .db!.collection('tokens')
        .countDocuments({ userId: { $exists: true } }),
    ).toBe(1);
  });

  it.each([
    ['GitHub style, 200 with an error', () => json({ error: 'bad_verification_code' })],
    ['a 400', () => json({ error: 'invalid_grant' }, { status: 400 })],
    ['a 500', () => new Response('', { status: 500 })],
  ])('stores nothing when the provider refuses the code (%s)', async (_label, response) => {
    const { oauth } = setup([response]);
    const user = userId();
    await expect(connect(oauth, user)).rejects.toThrow();
    await expect(oauth.connected(user, github)).resolves.toBe(false);
  });
});

describe('token', () => {
  it('is null for a user who never connected', async () => {
    const { oauth } = setup([]);
    await expect(oauth.token(userId(), github)).resolves.toBeNull();
  });

  it('keeps users apart', async () => {
    const { oauth } = setup([() => json({ access_token: 'mine' })]);
    const user = userId();
    await connect(oauth, user);
    await expect(oauth.token(userId(), github)).resolves.toBeNull();
    await expect(oauth.token(user, github)).resolves.toBe('mine');
  });

  it('treats a grant from a replaced app as no connection', async () => {
    const { oauth } = setup([() => json({ access_token: 'old-app' })]);
    const user = userId();
    await connect(oauth, user);
    await expect(oauth.token(user, { ...github, clientId: 'client-2' })).resolves.toBeNull();
  });

  it('refreshes an expiring token once for concurrent callers and keeps a refresh token that did not rotate', async () => {
    let clock = 1_000_000;
    const { oauth, fetchFn } = setup(
      [
        () => json({ access_token: 'a1', refresh_token: 'r1', expires_in: 7200 }),
        () => json({ access_token: 'a2', expires_in: 7200 }),
        () => json({ access_token: 'a3', expires_in: 7200 }),
      ],
      () => clock,
    );
    const user = userId();
    await connect(oauth, user, gitlab);
    clock += 7200 * 1000;
    const tokens = await Promise.all([oauth.token(user, gitlab), oauth.token(user, gitlab)]);
    expect(tokens).toEqual(['a2', 'a2']);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const refreshForm = formOf(fetchFn.mock.calls[1][1]);
    expect(refreshForm.get('grant_type')).toBe('refresh_token');
    expect(refreshForm.get('refresh_token')).toBe('r1');

    clock += 7200 * 1000;
    await expect(oauth.token(user, gitlab)).resolves.toBe('a3');
    expect(formOf(fetchFn.mock.calls[2][1]).get('refresh_token')).toBe('r1');
  });

  it('serves a grant without a refresh token until it expires, then reports it disconnected', async () => {
    let clock = 1_000_000;
    const { oauth, fetchFn } = setup(
      [() => json({ access_token: 'a1', expires_in: 60 })],
      () => clock,
    );
    const user = userId();
    await connect(oauth, user, gitlab);
    /** Inside the refresh margin, but with nothing to refresh with it is still the token. */
    clock += 50 * 1000;
    await expect(oauth.token(user, gitlab)).resolves.toBe('a1');
    await expect(oauth.connected(user, gitlab)).resolves.toBe(true);
    clock += 20 * 1000;
    await expect(oauth.token(user, gitlab)).resolves.toBeNull();
    await expect(oauth.connected(user, gitlab)).resolves.toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refreshes once when a concurrent caller reads the grant after the refresh finished', async () => {
    let clock = 1_000_000;
    const { oauth: connector } = setup(
      [() => json({ access_token: 'a1', refresh_token: 'r1', expires_in: 7200 })],
      () => clock,
    );
    const user = userId();
    await connect(connector, user, gitlab);
    /** The second read of the stored grant answers only once the first caller is done. */
    let release: () => void = () => undefined;
    const firstDone = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    const slowStore: PullRequestOAuthStore = {
      ...store,
      findToken: async (query) => {
        const row = await store.findToken(query);
        reads += 1;
        if (reads === 2) await firstDone;
        return row;
      },
    };
    const fetchFn = jest.fn(async () => json({ access_token: 'a2', expires_in: 7200 }));
    const oauth = createPullRequestOAuth({
      store: slowStore,
      fetchFn,
      secret,
      redirectUri,
      encrypt,
      decrypt,
      now: () => clock,
    });
    clock += 7200 * 1000;
    const first = oauth.token(user, gitlab).finally(release);
    const second = oauth.token(user, gitlab);
    await expect(Promise.all([first, second])).resolves.toEqual(['a2', 'a2']);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('disconnects a user whose refresh token the provider rejects', async () => {
    let clock = 1_000_000;
    const { oauth } = setup(
      [
        () => json({ access_token: 'a1', refresh_token: 'r1', expires_in: 60 }),
        () => json({ error: 'invalid_grant' }, { status: 400 }),
      ],
      () => clock,
    );
    const user = userId();
    await connect(oauth, user, gitlab);
    clock += 120 * 1000;
    await expect(oauth.token(user, gitlab)).resolves.toBeNull();
    await expect(oauth.connected(user, gitlab)).resolves.toBe(false);
  });

  it.each([
    ['an empty server error', () => new Response('', { status: 503 })],
    [
      'a server error with an OAuth error body',
      () => json({ error: 'temporarily_unavailable' }, { status: 503 }),
    ],
  ])('keeps the connection and reports the outage on %s', async (_name, outage) => {
    let clock = 1_000_000;
    const { oauth } = setup(
      [() => json({ access_token: 'a1', refresh_token: 'r1', expires_in: 60 }), outage],
      () => clock,
    );
    const user = userId();
    await connect(oauth, user, gitlab);
    clock += 120 * 1000;
    await expect(oauth.token(user, gitlab)).rejects.toThrow('Token endpoint answered 503');
    await expect(oauth.connected(user, gitlab)).resolves.toBe(true);
  });

  it('gives up on a token endpoint slower than the configured request timeout', async () => {
    const fetchFn = jest.fn(
      (_input: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const oauth = createPullRequestOAuth({ store, fetchFn, secret, redirectUri, encrypt, decrypt });
    const { url } = oauth.authorizationUrl({ id: userId() }, github);
    const claims = oauth.verifyState(new URL(url).searchParams.get('state') ?? '');
    const started = Date.now();
    await expect(
      oauth.complete(claims!, 'the-code', { ...github, requestTimeoutSeconds: 1 }),
    ).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('extends a grant that never expires each time it is used past half its retention', async () => {
    const { oauth } = setup([() => json({ access_token: 'forever' })]);
    const user = userId();
    const config = { ...github, retentionDays: 10 };
    await connect(oauth, user, config);
    const tokens = mongoose.connection.db!.collection('tokens');
    const first = (await tokens.findOne({}))!.expiresAt as Date;
    expect(first.getTime() - Date.now()).toBeGreaterThan(9.9 * 86_400_000);

    /** Used early: nothing to extend. */
    await expect(oauth.token(user, config)).resolves.toBe('forever');
    await new Promise((resolve) => setImmediate(resolve));
    expect(((await tokens.findOne({}))!.expiresAt as Date).getTime()).toBe(first.getTime());

    /** Six days in, the row would go in four: using it starts the retention again. */
    await tokens.updateOne({}, { $set: { expiresAt: new Date(Date.now() + 4 * 86_400_000) } });
    await expect(oauth.token(user, config)).resolves.toBe('forever');
    await new Promise((resolve) => setTimeout(resolve, 100));
    const extended = (await tokens.findOne({}))!.expiresAt as Date;
    expect(extended.getTime() - Date.now()).toBeGreaterThan(9.9 * 86_400_000);
    await expect(oauth.token(user, config)).resolves.toBe('forever');
  });

  it('takes the grant another replica stored when its refresh lost the race', async () => {
    let clock = 1_000_000;
    const replicaA = setup(
      [() => json({ access_token: 'a1', refresh_token: 'r1', expires_in: 60 })],
      () => clock,
    );
    const user = userId();
    await connect(replicaA.oauth, user, gitlab);
    clock += 120 * 1000;
    /** Replica B refreshed first and rotated the refresh token; A's refresh is then refused. */
    const replicaB = setup(
      [() => json({ access_token: 'b2', refresh_token: 'r2', expires_in: 7200 })],
      () => clock,
    );
    await expect(replicaB.oauth.token(user, gitlab)).resolves.toBe('b2');
    const stale = setup([() => json({ error: 'invalid_grant' }, { status: 400 })], () => clock);
    await expect(stale.oauth.token(user, gitlab)).resolves.toBe('b2');
    await expect(stale.oauth.connected(user, gitlab)).resolves.toBe(true);
  });
});

describe('a grant that cannot be read', () => {
  it('reports a decryption failure as a failure, not as a disconnection', async () => {
    const { oauth } = setup([() => json({ access_token: 'kept' })]);
    const user = userId();
    await connect(oauth, user);
    const broken = createPullRequestOAuth({
      store,
      fetchFn: jest.fn(),
      secret,
      redirectUri,
      encrypt,
      decrypt: async () => {
        throw new Error('key unavailable');
      },
    });
    await expect(broken.token(user, github)).rejects.toThrow('key unavailable');
    await expect(broken.connected(user, github)).rejects.toThrow('key unavailable');
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['JSON that is not a grant', JSON.stringify({ accessToken: 7, clientId: github.clientId })],
    ['a grant without its app', JSON.stringify({ accessToken: 'kept' })],
  ])('reports %s as a failure, not as a disconnection', async (_label, plaintext) => {
    const { oauth } = setup([() => json({ access_token: 'kept' })]);
    const user = userId();
    await connect(oauth, user);
    const garbled = createPullRequestOAuth({
      store,
      fetchFn: jest.fn(),
      secret,
      redirectUri,
      encrypt,
      decrypt: async () => plaintext,
    });
    await expect(garbled.token(user, github)).rejects.toThrow('malformed');
    await expect(garbled.connected(user, github)).rejects.toThrow('malformed');
  });
});

describe('disconnect', () => {
  it('removes the stored grant', async () => {
    const { oauth } = setup([() => json({ access_token: 'gone' })]);
    const user = userId();
    await connect(oauth, user);
    await oauth.disconnect(user);
    await expect(oauth.token(user, github)).resolves.toBeNull();
    expect(await mongoose.connection.db!.collection('tokens').countDocuments({})).toBe(0);
  });

  it("removes grants made under an earlier app or host, and only that user's", async () => {
    const { oauth } = setup([
      () => json({ access_token: 'github-grant' }),
      () => json({ access_token: 'gitlab-grant' }),
      () => json({ access_token: 'someone-else' }),
    ]);
    const user = userId();
    const other = userId();
    await connect(oauth, user, github);
    await connect(oauth, user, gitlab);
    await connect(oauth, other, github);
    await oauth.disconnect(user);
    await expect(oauth.token(user, github)).resolves.toBeNull();
    await expect(oauth.token(user, gitlab)).resolves.toBeNull();
    await expect(oauth.token(other, github)).resolves.toBe('someone-else');
  });
});

describe('flow timeout', () => {
  it('signs the state for the configured number of minutes', () => {
    const { oauth } = setup([]);
    const { url } = oauth.authorizationUrl({ id: userId() }, { ...github, flowTimeoutMinutes: 3 });
    const claims = jwt.decode(new URL(url).searchParams.get('state') ?? '') as {
      iat: number;
      exp: number;
    };
    expect(claims.exp - claims.iat).toBe(180);
  });
});
