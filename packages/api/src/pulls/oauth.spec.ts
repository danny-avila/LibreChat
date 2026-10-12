import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createMethods, createModels } from '@librechat/data-schemas';
import type { PullRequestOAuthConfig } from './settings';
import type { PullRequestOAuthStore } from './oauth';
import {
  oauthEndpoints,
  createPullRequestOAuth,
  PULL_REQUEST_OAUTH_TYPE,
  PULL_REQUEST_OAUTH_GENERATION_TYPE,
} from './oauth';

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

const settle = () => new Promise((resolve) => setImmediate(resolve));
async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!condition()) throw new Error('condition not reached');
}
const users = () => mongoose.connection.db!.collection('users');
const tokens = () => mongoose.connection.db!.collection('tokens');

function setup(responses: Array<() => Response | Promise<Response>>, now = () => Date.now()) {
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
  /** Completion stores only for a user that exists and is not being deleted. */
  await users().updateOne(
    { _id: new mongoose.Types.ObjectId(user) },
    { $setOnInsert: { email: `${user}@example.com` } },
    { upsert: true },
  );
  const { url } = await oauth.authorizationUrl({ id: user }, config);
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
  it('sends the user to the provider with a signed state and an S256 challenge', async () => {
    const { oauth } = setup([]);
    const { url, flowId } = await oauth.authorizationUrl({ id: 'u1', tenantId: 't1' }, gitlab);
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

  it('asks GitHub for no scope unless one is configured', async () => {
    const { oauth } = setup([]);
    expect(
      new URL((await oauth.authorizationUrl({ id: 'u1' }, github)).url).searchParams.has('scope'),
    ).toBe(false);
    const scoped = await oauth.authorizationUrl({ id: 'u1' }, { ...github, scope: 'repo' });
    expect(new URL(scoped.url).searchParams.get('scope')).toBe('repo');
  });

  it('starts a new flow each time', async () => {
    const { oauth } = setup([]);
    const first = await oauth.authorizationUrl({ id: 'u1' }, github);
    const second = await oauth.authorizationUrl({ id: 'u1' }, github);
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
    await users().insertOne({
      _id: new mongoose.Types.ObjectId(user),
      email: `${user}@example.com`,
    });
    const { url } = await oauth.authorizationUrl({ id: user }, github);
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
        /** Only reads of the grant itself; the generation is read around them. */
        if (!query.scope.startsWith(`${PULL_REQUEST_OAUTH_TYPE}:`)) return row;
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
    ['GitHub style, 200', () => json({ error: 'bad_refresh_token' })],
    ['a 401', () => json({ error: 'invalid_grant' }, { status: 401 })],
  ])('treats a refused refresh token as a disconnection (%s)', async (_label, refusal) => {
    let clock = 1_000_000;
    const { oauth } = setup(
      [() => json({ access_token: 'a1', refresh_token: 'r1', expires_in: 60 }), refusal],
      () => clock,
    );
    const user = userId();
    await connect(oauth, user, gitlab);
    clock += 120 * 1000;
    await expect(oauth.token(user, gitlab)).resolves.toBeNull();
    await expect(oauth.connected(user, gitlab)).resolves.toBe(false);
  });

  it.each([
    ['invalid_client, 401', () => json({ error: 'invalid_client' }, { status: 401 })],
    ['invalid_client, 400', () => json({ error: 'invalid_client' }, { status: 400 })],
    [
      'GitHub incorrect_client_credentials, 200',
      () => json({ error: 'incorrect_client_credentials' }),
    ],
    ['a 400 without a body', () => new Response('', { status: 400 })],
  ])('keeps the grant when the error is not about it (%s)', async (_label, failure) => {
    let clock = 1_000_000;
    const { oauth } = setup(
      [
        () => json({ access_token: 'a1', refresh_token: 'r1', expires_in: 60 }),
        failure,
        () => json({ access_token: 'a2', refresh_token: 'r2', expires_in: 7200 }),
      ],
      () => clock,
    );
    const user = userId();
    await connect(oauth, user, gitlab);
    clock += 120 * 1000;
    await expect(oauth.token(user, gitlab)).rejects.toThrow('Token endpoint answered');
    await expect(oauth.connected(user, gitlab)).resolves.toBe(true);
    /** Once the secret is fixed, the same grant refreshes. */
    await expect(oauth.token(user, gitlab)).resolves.toBe('a2');
  });

  /** A refresh held at the provider until the test answers it. */
  function heldRefresh(clock: () => number, body: Record<string, unknown>) {
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    /** Resolves once the request is at the provider, which is after the claim is stored. */
    let reached: () => void = () => undefined;
    const requested = new Promise<void>((resolve) => (reached = resolve));
    const replica = setup([], clock);
    replica.fetchFn.mockImplementationOnce(async () => {
      reached();
      await answered;
      return json(body);
    });
    return { ...replica, answer, requested };
  }

  async function connectExpiring(clock: () => number) {
    const { oauth } = setup(
      [() => json({ access_token: 'a1', refresh_token: 'r1', expires_in: 60 })],
      clock,
    );
    const user = userId();
    await connect(oauth, user, gitlab);
    return user;
  }

  it('lets one replica at a time spend the refresh token', async () => {
    let clock = 1_000_000;
    const user = await connectExpiring(() => clock);
    clock += 120 * 1000;
    const replicaA = heldRefresh(() => clock, {
      access_token: 'a2',
      refresh_token: 'r2',
      expires_in: 7200,
    });
    const first = replicaA.oauth.token(user, gitlab);
    await replicaA.requested;
    /** B finds A's claim and does not send the same refresh token. */
    const replicaB = setup([], () => clock);
    await expect(replicaB.oauth.token(user, gitlab)).rejects.toThrow('Another refresh');
    expect(replicaB.fetchFn).not.toHaveBeenCalled();
    await expect(replicaB.oauth.connected(user, gitlab)).resolves.toBe(true);
    replicaA.answer();
    await expect(first).resolves.toBe('a2');
    await expect(replicaB.oauth.token(user, gitlab)).resolves.toBe('a2');
  });

  it("stores a stalled replica's refresh over another replica's refusal of the same grant", async () => {
    let clock = 1_000_000;
    const user = await connectExpiring(() => clock);
    clock += 120 * 1000;
    const replicaA = heldRefresh(() => clock, {
      access_token: 'a2',
      refresh_token: 'r2',
      expires_in: 7200,
    });
    const first = replicaA.oauth.token(user, gitlab);
    await replicaA.requested;
    /** A outlives its claim; B claims the grant and is refused the token A already rotated. */
    clock += 60 * 1000;
    const replicaB = setup([() => json({ error: 'invalid_grant' }, { status: 400 })], () => clock);
    await expect(replicaB.oauth.token(user, gitlab)).resolves.toBeNull();
    await expect(replicaB.oauth.connected(user, gitlab)).resolves.toBe(false);
    /** A's answer is the only grant the provider still accepts, so it is kept. */
    replicaA.answer();
    await expect(first).resolves.toBe('a2');
    await expect(replicaB.oauth.connected(user, gitlab)).resolves.toBe(true);
    await expect(replicaB.oauth.token(user, gitlab)).resolves.toBe('a2');
  });

  it('does not bring back a connection removed while its refresh was in flight', async () => {
    let clock = 1_000_000;
    const user = await connectExpiring(() => clock);
    clock += 120 * 1000;
    const replica = heldRefresh(() => clock, {
      access_token: 'a2',
      refresh_token: 'r2',
      expires_in: 7200,
    });
    const pending = replica.oauth.token(user, gitlab);
    await replica.requested;
    await replica.oauth.disconnect(user);
    replica.answer();
    await expect(pending).resolves.toBeNull();
    await expect(replica.oauth.connected(user, gitlab)).resolves.toBe(false);
    expect(
      await tokens().countDocuments({
        userId: new mongoose.Types.ObjectId(user),
        type: PULL_REQUEST_OAUTH_TYPE,
      }),
    ).toBe(0);
  });

  it('releases its claim after an outage, so the next attempt need not wait it out', async () => {
    let clock = 1_000_000;
    const user = await connectExpiring(() => clock);
    clock += 120 * 1000;
    const { oauth } = setup([() => new Response('', { status: 503 })], () => clock);
    await expect(oauth.token(user, gitlab)).rejects.toThrow('Token endpoint answered');
    const other = setup(
      [() => json({ access_token: 'a2', refresh_token: 'r2', expires_in: 7200 })],
      () => clock,
    );
    await expect(other.oauth.token(user, gitlab)).resolves.toBe('a2');
  });

  it('does not hand a read under a shortened retention the answer of one under the old', async () => {
    let clock = Date.now();
    const long = { ...github, retentionDays: 180 };
    const { oauth: connector } = setup([() => json({ access_token: 'kept' })], () => clock);
    const user = userId();
    await connect(connector, user, long);
    clock += 2 * 24 * 60 * 60 * 1000;
    /** The read under the old retention is held at the store until the new one has answered. */
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    const heldStore: PullRequestOAuthStore = {
      ...store,
      findToken: async (query) => {
        reads += 1;
        if (reads === 1) await held;
        return store.findToken(query);
      },
    };
    const oauth = createPullRequestOAuth({
      store: heldStore,
      fetchFn: jest.fn(),
      secret,
      redirectUri,
      encrypt,
      decrypt,
      now: () => clock,
    });
    const old = oauth.token(user, long);
    /** Unused for two days: under a one-day retention it is gone, whatever the old read says. */
    const shortened = oauth.token(user, { ...github, retentionDays: 1 });
    await expect(Promise.race([shortened, held.then(() => 'joined')])).resolves.toBeNull();
    release();
    await old;
  });

  it("does not hand a replaced app's token to a read under the new app", async () => {
    let clock = 1_000_000;
    const user = await connectExpiring(() => clock);
    clock += 120 * 1000;
    const replica = heldRefresh(() => clock, {
      access_token: 'a2',
      refresh_token: 'r2',
      expires_in: 7200,
    });
    const old = replica.oauth.token(user, gitlab);
    /** Same provider and host, another app: its own read, which finds no grant of its own. */
    const replaced = replica.oauth.token(user, { ...gitlab, clientId: 'gl-client-2' });
    await expect(replaced).resolves.toBeNull();
    replica.answer();
    await expect(old).resolves.toBe('a2');
  });

  it('applies a shortened retention to a grant stored under a longer one', async () => {
    let clock = Date.now();
    const { oauth } = setup([() => json({ access_token: 'kept' })], () => clock);
    const user = userId();
    await connect(oauth, user, { ...github, retentionDays: 180 });
    const shortened = { ...github, retentionDays: 1 };
    /** Used now: served, and the row is cut down to the new retention. */
    await expect(oauth.token(user, shortened)).resolves.toBe('kept');
    await settle();
    await settle();
    const row = await tokens().findOne({ userId: new mongoose.Types.ObjectId(user) });
    /** The store stamps the row on its own clock. */
    expect(new Date(row?.expiresAt).getTime()).toBeLessThanOrEqual(
      Date.now() + 24 * 60 * 60 * 1000,
    );
    /** Then left unused past it: gone, and the row removed. */
    clock += 2 * 24 * 60 * 60 * 1000;
    await expect(oauth.token(user, shortened)).resolves.toBeNull();
    await expect(oauth.connected(user, shortened)).resolves.toBe(false);
  });

  it('ends a grant unused for longer than the current retention, whatever its row says', async () => {
    let clock = Date.now();
    const { oauth } = setup([() => json({ access_token: 'old' })], () => clock);
    const user = userId();
    await connect(oauth, user, { ...github, retentionDays: 180 });
    clock += 2 * 24 * 60 * 60 * 1000;
    await expect(oauth.token(user, { ...github, retentionDays: 1 })).resolves.toBeNull();
    await settle();
    expect(await tokens().countDocuments({ userId: new mongoose.Types.ObjectId(user) })).toBe(0);
  });

  it('reports a failed removal of a grant past the retention as a failure, not as absence', async () => {
    let clock = Date.now();
    const { oauth: connector } = setup([() => json({ access_token: 'old' })], () => clock);
    const user = userId();
    await connect(connector, user, { ...github, retentionDays: 180 });
    clock += 2 * 24 * 60 * 60 * 1000;
    const failing = createPullRequestOAuth({
      store: { ...store, deleteTokens: jest.fn().mockRejectedValue(new Error('mongo down')) },
      fetchFn: jest.fn(),
      secret,
      redirectUri,
      encrypt,
      decrypt,
      now: () => clock,
    });
    const shortened = { ...github, retentionDays: 1 };
    await expect(failing.token(user, shortened)).rejects.toThrow('mongo down');
    await expect(failing.connected(user, shortened)).rejects.toThrow('mongo down');
  });

  it('treats a row past its retention as gone, and does not extend it', async () => {
    let clock = Date.now();
    const config = { ...github, retentionDays: 1 };
    const { oauth } = setup([() => json({ access_token: 'old' })], () => clock);
    const user = userId();
    await connect(oauth, user, config);
    const before = await tokens().findOne({ userId: new mongoose.Types.ObjectId(user) });
    expect(before?.expiresAt).toBeInstanceOf(Date);
    clock += 2 * 24 * 60 * 60 * 1000;
    await expect(oauth.token(user, config)).resolves.toBeNull();
    await expect(oauth.connected(user, config)).resolves.toBe(false);
    await settle();
    const after = await tokens().findOne({ userId: new mongoose.Types.ObjectId(user) });
    expect(after?.expiresAt).toEqual(before?.expiresAt);
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
    const { url } = await oauth.authorizationUrl({ id: userId() }, github);
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

describe('reject', () => {
  it('disconnects a grant the provider refused on a lookup', async () => {
    const { oauth } = setup([() => json({ access_token: 'revoked' })]);
    const user = userId();
    await connect(oauth, user);
    await oauth.reject(user, github, 'revoked');
    await expect(oauth.connected(user, github)).resolves.toBe(false);
    await expect(oauth.token(user, github)).resolves.toBeNull();
  });

  it('keeps a grant replaced since the refused token was read', async () => {
    const { oauth } = setup([
      () => json({ access_token: 'old' }),
      () => json({ access_token: 'new' }),
    ]);
    const user = userId();
    await connect(oauth, user);
    await connect(oauth, user);
    await oauth.reject(user, github, 'old');
    await expect(oauth.token(user, github)).resolves.toBe('new');
  });
});

describe('completion during account deletion', () => {
  it('spends no code on a flow started for another provider or host', async () => {
    const user = userId();
    await users().insertOne({
      _id: new mongoose.Types.ObjectId(user),
      email: `${user}@example.com`,
    });
    const { oauth, fetchFn } = setup([() => json({ access_token: 'wrong' })]);
    const { url } = await oauth.authorizationUrl({ id: user }, github);
    const claims = oauth.verifyState(new URL(url).searchParams.get('state') ?? '');
    await expect(oauth.complete(claims!, 'the-code', gitlab)).rejects.toThrow('another provider');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  async function complete(oauth: ReturnType<typeof setup>['oauth'], user: string) {
    const { url } = await oauth.authorizationUrl({ id: user }, github);
    const claims = oauth.verifyState(new URL(url).searchParams.get('state') ?? '');
    if (claims == null) throw new Error('state did not verify');
    return oauth.complete(claims, 'the-code', github);
  }

  it.each([
    ['whose deletion has started', { agentTriggerDeletionStartedAt: new Date() }],
    ['that no longer exists', null],
  ])('spends no code and stores nothing for a user %s', async (_label, fields) => {
    const user = userId();
    if (fields != null) {
      await users().insertOne({
        _id: new mongoose.Types.ObjectId(user),
        email: `${user}@example.com`,
        ...fields,
      });
    }
    const { oauth, fetchFn } = setup([() => json({ access_token: 'late' })]);
    await expect(complete(oauth, user)).rejects.toThrow('not active');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await tokens().countDocuments({ userId: new mongoose.Types.ObjectId(user) })).toBe(0);
  });

  it('removes the grant it stored when the deletion started during the exchange', async () => {
    const user = userId();
    const _id = new mongoose.Types.ObjectId(user);
    await users().insertOne({ _id, email: `${user}@example.com` });
    const { oauth } = setup([
      async () => {
        await users().updateOne({ _id }, { $set: { agentTriggerDeletionStartedAt: new Date() } });
        return json({ access_token: 'late' });
      },
    ]);
    await expect(complete(oauth, user)).rejects.toThrow('not active');
    expect(await tokens().countDocuments({ userId: _id })).toBe(0);
  });
});

describe('disconnect', () => {
  /** A replica whose next read of the grant row waits until released. */
  function heldReplica() {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    let reached: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => (reached = resolve));
    let holding = true;
    const heldStore: PullRequestOAuthStore = {
      ...store,
      findToken: async (query) => {
        if (holding && query.scope.startsWith(`${PULL_REQUEST_OAUTH_TYPE}:`)) {
          holding = false;
          const row = await store.findToken(query);
          reached();
          await held;
          return row;
        }
        return store.findToken(query);
      },
    };
    const oauth = createPullRequestOAuth({
      store: heldStore,
      fetchFn: jest.fn(),
      secret,
      redirectUri,
      encrypt,
      decrypt,
    });
    return { oauth, release, waiting };
  }

  /** A replica whose disconnect pauses at `step` ('delete': before removing the grants;
   *  'last': before replacing the generation after it) until resumed. */
  function pausedDisconnect(step: 'delete' | 'last') {
    let resume: () => void = () => undefined;
    const resumed = new Promise<void>((resolve) => (resume = resolve));
    let paused: () => void = () => undefined;
    const reached = new Promise<void>((resolve) => (paused = resolve));
    let deleted = false;
    const pausing: PullRequestOAuthStore = {
      ...store,
      deleteTokens: async (query) => {
        if (step === 'delete' && 'type' in query) {
          paused();
          await resumed;
        }
        deleted = true;
        return store.deleteTokens(query);
      },
      replaceTokenIfCurrent: async (scope, expected, data) => {
        if (step === 'last' && deleted && data.type === PULL_REQUEST_OAUTH_GENERATION_TYPE) {
          paused();
          await resumed;
        }
        return store.replaceTokenIfCurrent(scope, expected, data);
      },
    };
    const oauth = createPullRequestOAuth({
      store: pausing,
      fetchFn: jest.fn(),
      secret,
      redirectUri,
      encrypt,
      decrypt,
    });
    return { oauth, resume, reached };
  }

  it('does not answer with a grant read between the start of a disconnect and its end', async () => {
    const { oauth: connector } = setup([() => json({ access_token: 'old' })]);
    const user = userId();
    await connect(connector, user);
    const disconnecting = pausedDisconnect('delete');
    const disconnected = disconnecting.oauth.disconnect(user);
    await disconnecting.reached;
    /** Read after the first generation change, while the grant is still there. */
    const reader = heldReplica();
    const pending = reader.oauth.token(user, github);
    await reader.waiting;
    disconnecting.resume();
    await disconnected;
    reader.release();
    await expect(pending).resolves.toBeNull();
  });

  it('removes a grant stored between the removal of the grants and the end of a disconnect', async () => {
    const user = userId();
    await users().insertOne({
      _id: new mongoose.Types.ObjectId(user),
      email: `${user}@example.com`,
    });
    const { oauth } = setup([() => json({ access_token: 'late' })]);
    const { url } = await oauth.authorizationUrl({ id: user }, github);
    const claims = oauth.verifyState(new URL(url).searchParams.get('state') ?? '');
    const disconnecting = pausedDisconnect('last');
    const disconnected = disconnecting.oauth.disconnect(user);
    await disconnecting.reached;
    await expect(oauth.complete(claims!, 'the-code', github)).rejects.toThrow(
      'before a disconnect',
    );
    disconnecting.resume();
    await disconnected;
    expect(await tokens().countDocuments({ type: PULL_REQUEST_OAUTH_TYPE })).toBe(0);
  });

  it.each([
    ['this process', true],
    ['another replica', false],
  ])(
    'does not answer with a grant a read found before a disconnect in %s finished',
    async (_label, sameProcess) => {
      const { oauth: connector } = setup([() => json({ access_token: 'old' })]);
      const user = userId();
      await connect(connector, user);
      const reader = heldReplica();
      const pending = reader.oauth.token(user, github);
      await reader.waiting;
      await (sameProcess ? reader.oauth : connector).disconnect(user);
      /** A request after the disconnect: in this process it does not join the earlier read; on a
       *  replica that did not run the disconnect it may, and that read then answers null too. */
      const later = reader.oauth.token(user, github);
      reader.release();
      await expect(later).resolves.toBeNull();
      await expect(pending).resolves.toBeNull();
    },
  );

  it('voids a flow started before it, even one whose exchange is under way', async () => {
    const { oauth } = setup([
      () => json({ access_token: 'first' }),
      () => json({ access_token: 'late' }),
    ]);
    const user = userId();
    await connect(oauth, user);
    /** A flow started while connected, then the user disconnects before it comes back. */
    const { url } = await oauth.authorizationUrl({ id: user }, github);
    const claims = oauth.verifyState(new URL(url).searchParams.get('state') ?? '');
    await oauth.disconnect(user);
    await expect(oauth.complete(claims!, 'the-code', github)).rejects.toThrow(
      'before a disconnect',
    );
    await expect(oauth.connected(user, github)).resolves.toBe(false);
  });

  it('removes a grant a flow stored while the disconnect ran', async () => {
    const user = userId();
    const { oauth } = setup([
      async () => {
        await oauth.disconnect(user);
        return json({ access_token: 'late' });
      },
    ]);
    await users().insertOne({
      _id: new mongoose.Types.ObjectId(user),
      email: `${user}@example.com`,
    });
    const { url } = await oauth.authorizationUrl({ id: user }, github);
    const claims = oauth.verifyState(new URL(url).searchParams.get('state') ?? '');
    await expect(oauth.complete(claims!, 'the-code', github)).rejects.toThrow(
      'before a disconnect',
    );
    expect(await tokens().countDocuments({ type: PULL_REQUEST_OAUTH_TYPE })).toBe(0);
  });

  it('does not report a connection a disconnect on another replica removed during the read', async () => {
    const { oauth: connector } = setup([() => json({ access_token: 'old' })]);
    const user = userId();
    await connect(connector, user);
    const reader = heldReplica();
    const pending = reader.oauth.connected(user, github);
    await reader.waiting;
    await connector.disconnect(user);
    reader.release();
    await expect(pending).resolves.toBe(false);
  });

  it('keeps a read started after a disconnect joinable when an earlier read finishes', async () => {
    const { oauth: connector } = setup([
      () => json({ access_token: 'first' }),
      () => json({ access_token: 'second' }),
    ]);
    const user = userId();
    await connect(connector, user);
    /** Each read of the grant waits for its own release. */
    const releases: Array<() => void> = [];
    let grantReads = 0;
    const gated: PullRequestOAuthStore = {
      ...store,
      findToken: async (query) => {
        if (!query.scope.startsWith(`${PULL_REQUEST_OAUTH_TYPE}:`)) return store.findToken(query);
        grantReads += 1;
        await new Promise<void>((resolve) => releases.push(resolve));
        return store.findToken(query);
      },
    };
    const oauth = createPullRequestOAuth({
      store: gated,
      fetchFn: jest.fn(),
      secret,
      redirectUri,
      encrypt,
      decrypt,
    });
    const earlier = oauth.token(user, github);
    await waitFor(() => releases.length === 1);
    await oauth.disconnect(user);
    await connect(connector, user);
    const later = oauth.token(user, github);
    await waitFor(() => releases.length === 2);
    releases[0]();
    await earlier;
    /** A third caller joins the later read rather than starting its own. */
    const third = oauth.token(user, github);
    await new Promise((resolve) => setImmediate(resolve));
    expect(grantReads).toBe(2);
    releases[1]();
    await expect(Promise.all([later, third])).resolves.toEqual(['second', 'second']);
  });

  it('lets a flow started after it connect again', async () => {
    const { oauth } = setup([
      () => json({ access_token: 'first' }),
      () => json({ access_token: 'again' }),
    ]);
    const user = userId();
    await connect(oauth, user);
    await oauth.disconnect(user);
    await connect(oauth, user);
    await expect(oauth.token(user, github)).resolves.toBe('again');
  });

  it('removes the stored grant', async () => {
    const { oauth } = setup([() => json({ access_token: 'gone' })]);
    const user = userId();
    await connect(oauth, user);
    await oauth.disconnect(user);
    await expect(oauth.token(user, github)).resolves.toBeNull();
    expect(await tokens().countDocuments({ type: PULL_REQUEST_OAUTH_TYPE })).toBe(0);
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
  it('signs the state for the configured number of minutes', async () => {
    const { oauth } = setup([]);
    const { url } = await oauth.authorizationUrl(
      { id: userId() },
      { ...github, flowTimeoutMinutes: 3 },
    );
    const claims = jwt.decode(new URL(url).searchParams.get('state') ?? '') as {
      iat: number;
      exp: number;
    };
    expect(claims.exp - claims.iat).toBe(180);
  });
});
