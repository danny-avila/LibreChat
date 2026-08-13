import express from 'express';
import request from 'supertest';
import { Webhook } from 'standardwebhooks';
import type { ClerkWebhookConfig } from './webhook';
import {
  createClerkWebhookLifecycle,
  createClerkWebhookHandler,
  createMongooseClerkWebhookLifecycle,
  createClerkWebhookRouteHandler,
  createClerkWebhookRequest,
  narrowClerkWebhookEvent,
  verifyClerkWebhookRequest,
} from './webhook';
import { CLERK_CLOCK_SKEW_MS, MAX_CLERK_TOKEN_LIFETIME_MS } from './verify';

describe('createClerkWebhookRequest', () => {
  it('preserves the raw body bytes, request target, method, and signature headers', async () => {
    const body = Buffer.from([0x7b, 0x22, 0x61, 0x22, 0x3a, 0xff, 0x7d]);

    const request = createClerkWebhookRequest({
      body,
      method: 'POST',
      url: 'https://chat.example/api/auth/clerk/webhook?delivery=1',
      headers: [
        ['content-type', 'application/json'],
        ['svix-id', 'msg_test'],
        ['svix-signature', 'v1,test-signature'],
        ['svix-timestamp', '1786611600'],
      ],
    });

    expect(request.method).toBe('POST');
    expect(request.url).toBe('https://chat.example/api/auth/clerk/webhook?delivery=1');
    expect(request.headers.get('svix-id')).toBe('msg_test');
    expect(request.headers.get('svix-signature')).toBe('v1,test-signature');
    expect(request.headers.get('svix-timestamp')).toBe('1786611600');
    expect(Buffer.from(await request.arrayBuffer())).toEqual(body);
  });

  it('copies duplicate raw headers without dropping their values', () => {
    const request = createClerkWebhookRequest({
      body: Buffer.from('{}'),
      method: 'POST',
      url: 'https://chat.example/api/auth/clerk/webhook',
      headers: [
        ['x-delivery-hop', 'one'],
        ['x-delivery-hop', 'two'],
      ],
    });

    expect(request.headers.get('x-delivery-hop')).toBe('one, two');
  });
});

describe('verifyClerkWebhookRequest', () => {
  const signingSecret = `whsec_${Buffer.from('fixture-signing-key-32-bytes-long').toString('base64')}`;
  const timestamp = new Date('2026-08-13T09:00:00.000Z');
  const body = JSON.stringify({
    type: 'session.revoked',
    data: { id: 'sess_123' },
  });

  function createSignedRequest(payload: string): Request {
    const signature = new Webhook(signingSecret).sign('msg_fixture', timestamp, body);
    return createClerkWebhookRequest({
      body: Buffer.from(payload),
      method: 'POST',
      url: 'https://chat.example/api/auth/clerk/webhook',
      headers: [
        ['content-type', 'application/json'],
        ['svix-id', 'msg_fixture'],
        ['svix-signature', signature],
        ['svix-timestamp', String(timestamp.getTime() / 1000)],
      ],
    });
  }

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(timestamp);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('verifies a deterministic Standard Webhooks signature with the real Clerk wrapper', async () => {
    await expect(
      verifyClerkWebhookRequest(createSignedRequest(body), { signingSecret }),
    ).resolves.toMatchObject({
      type: 'session.revoked',
      data: { id: 'sess_123' },
    });
  });

  it('rejects when any raw payload byte changes after signing', async () => {
    await expect(
      verifyClerkWebhookRequest(createSignedRequest(`${body} `), { signingSecret }),
    ).rejects.toThrow();
  });
});

describe('narrowClerkWebhookEvent', () => {
  const occurredAt = new Date('2026-08-13T09:00:00.000Z');

  it.each(['session.ended', 'session.revoked'] as const)(
    'accepts a valid %s event without trusting additional fields',
    (type) => {
      const event = narrowClerkWebhookEvent(
        {
          type,
          data: { id: 'sess_123', user_id: 'user_123' },
        },
        occurredAt,
      );

      expect(event).toEqual({
        kind: 'session_revoked',
        event: type === 'session.ended' ? 'session_ended' : 'session_revoked',
        clerkSessionId: 'sess_123',
        occurredAt,
      });
    },
  );

  it('accepts a valid user.deleted event', () => {
    const event = narrowClerkWebhookEvent(
      {
        type: 'user.deleted',
        data: { deleted: true, id: 'user_123', object: 'user' },
      },
      occurredAt,
    );

    expect(event).toEqual({
      kind: 'user_deleted',
      clerkUserId: 'user_123',
      occurredAt,
    });
  });

  it('ignores unsupported verified event payloads', () => {
    expect(
      narrowClerkWebhookEvent(
        {
          type: 'user.updated',
          data: { id: 'user_123' },
        },
        occurredAt,
      ),
    ).toEqual({ kind: 'unsupported' });
  });

  it.each([
    null,
    {},
    { type: 'session.revoked', data: {} },
    { type: 'user.deleted', data: { id: '   ' } },
  ])('rejects malformed supported events without producing a mutation command', (payload) => {
    expect(() => narrowClerkWebhookEvent(payload, occurredAt)).toThrow(
      'Invalid Clerk webhook event',
    );
  });
});

describe('createClerkWebhookLifecycle', () => {
  const occurredAt = new Date('2026-08-13T09:00:00.000Z');
  const expiration = new Date(
    occurredAt.getTime() + MAX_CLERK_TOKEN_LIFETIME_MS + CLERK_CLOCK_SKEW_MS,
  );

  function createDependencies() {
    const actions: string[] = [];
    const transaction = { id: 'transaction_1' };
    return {
      actions,
      transaction,
      dependencies: {
        withTransaction: jest.fn(
          async (operation: (value: typeof transaction) => Promise<void>) => {
            actions.push('transaction:start');
            await operation(transaction);
            actions.push('transaction:commit');
          },
        ),
        upsertSessionState: jest.fn().mockResolvedValue(undefined),
        upsertUserState: jest.fn().mockResolvedValue(undefined),
        findClerkSessionIdsByUser: jest.fn().mockResolvedValue([]),
        tombstoneUsersByClerkId: jest.fn().mockResolvedValue([]),
        deleteSessionsByClerkSessionId: jest.fn().mockResolvedValue(undefined),
        deleteSessionsByClerkUserId: jest.fn().mockResolvedValue(undefined),
        invalidateAuthUserDocuments: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  it('atomically fences a Clerk sid before deleting every correlated local Session', async () => {
    const { dependencies, transaction } = createDependencies();
    const lifecycle = createClerkWebhookLifecycle(dependencies);

    await lifecycle.revokeClerkSession({ clerkSessionId: 'sess_123', revokedAt: occurredAt });

    expect(dependencies.withTransaction).toHaveBeenCalledTimes(1);
    expect(dependencies.upsertSessionState).toHaveBeenCalledWith(
      {
        clerkSessionId: 'sess_123',
        state: 'revoked',
        revokedAt: occurredAt,
        expiration,
      },
      transaction,
    );
    expect(dependencies.deleteSessionsByClerkSessionId).toHaveBeenCalledWith(
      'sess_123',
      transaction,
    );
  });

  it('atomically tombstones a user, fences each sid, deletes Sessions, then invalidates caches', async () => {
    const { actions, dependencies, transaction } = createDependencies();
    dependencies.findClerkSessionIdsByUser.mockResolvedValue(['sess_1', 'sess_1', 'sess_2']);
    dependencies.tombstoneUsersByClerkId.mockImplementation(async () => {
      actions.push('users:tombstoned');
      return ['user_1', 'user_2'];
    });
    dependencies.invalidateAuthUserDocuments.mockImplementation(async () => {
      actions.push('cache:invalidated');
    });
    const lifecycle = createClerkWebhookLifecycle(dependencies);

    await lifecycle.tombstoneClerkUser({ clerkUserId: 'user_123', deletedAt: occurredAt });

    expect(dependencies.upsertUserState).toHaveBeenCalledWith(
      {
        clerkUserId: 'user_123',
        state: 'deleted',
        deletedAt: occurredAt,
        expiration,
      },
      transaction,
    );
    expect(dependencies.upsertSessionState).toHaveBeenCalledTimes(2);
    expect(dependencies.upsertSessionState).toHaveBeenNthCalledWith(
      1,
      {
        clerkSessionId: 'sess_1',
        state: 'revoked',
        revokedAt: occurredAt,
        expiration,
      },
      transaction,
    );
    expect(dependencies.upsertSessionState).toHaveBeenNthCalledWith(
      2,
      {
        clerkSessionId: 'sess_2',
        state: 'revoked',
        revokedAt: occurredAt,
        expiration,
      },
      transaction,
    );
    expect(dependencies.deleteSessionsByClerkUserId).toHaveBeenCalledWith('user_123', transaction);
    expect(dependencies.invalidateAuthUserDocuments).toHaveBeenCalledWith(['user_1', 'user_2']);
    expect(actions).toEqual([
      'transaction:start',
      'users:tombstoned',
      'transaction:commit',
      'cache:invalidated',
    ]);
  });

  it('does not invalidate caches when the transaction fails to commit', async () => {
    const { dependencies } = createDependencies();
    dependencies.tombstoneUsersByClerkId.mockRejectedValue(new Error('write conflict'));
    const lifecycle = createClerkWebhookLifecycle(dependencies);

    await expect(
      lifecycle.tombstoneClerkUser({ clerkUserId: 'user_123', deletedAt: occurredAt }),
    ).rejects.toThrow('write conflict');

    expect(dependencies.invalidateAuthUserDocuments).not.toHaveBeenCalled();
  });
});

describe('createMongooseClerkWebhookLifecycle', () => {
  function createDependencies() {
    const transaction = {
      withTransaction: jest.fn(async (operation: () => Promise<void>) => operation()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const methods = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      upsertUserState: jest.fn().mockResolvedValue(undefined),
      findClerkSessionIdsByClerkUserId: jest.fn().mockResolvedValue(['sess_1']),
      tombstoneClerkUsers: jest.fn().mockResolvedValue(['user_1']),
      deleteSessionsByClerkSessionId: jest.fn().mockResolvedValue(undefined),
      deleteSessionsByClerkUserId: jest.fn().mockResolvedValue(undefined),
      invalidateAuthUserDocCache: jest.fn().mockResolvedValue(undefined),
    };
    return {
      transaction,
      methods,
      dependencies: {
        startSession: jest.fn().mockResolvedValue(transaction),
        methods,
      },
    };
  }

  it('owns one Mongo transaction and forwards its session to session revocation methods', async () => {
    const { dependencies, methods, transaction } = createDependencies();
    const lifecycle = createMongooseClerkWebhookLifecycle(dependencies);
    const revokedAt = new Date('2026-08-13T09:00:00.000Z');

    await lifecycle.revokeClerkSession({ clerkSessionId: 'sess_1', revokedAt });

    expect(transaction.withTransaction).toHaveBeenCalledTimes(1);
    expect(methods.upsertSessionState).toHaveBeenCalledWith(
      expect.objectContaining({ clerkSessionId: 'sess_1', state: 'revoked', revokedAt }),
      { session: transaction },
    );
    expect(methods.deleteSessionsByClerkSessionId).toHaveBeenCalledWith('sess_1', {
      session: transaction,
    });
    expect(transaction.endSession).toHaveBeenCalledTimes(1);
  });

  it('defers user cache invalidation until the transaction commits', async () => {
    const actions: string[] = [];
    const { dependencies, methods, transaction } = createDependencies();
    transaction.withTransaction.mockImplementation(async (operation: () => Promise<void>) => {
      actions.push('transaction:start');
      await operation();
      actions.push('transaction:commit');
    });
    methods.tombstoneClerkUsers.mockImplementation(async () => {
      actions.push('users:tombstoned');
      return ['user_1'];
    });
    methods.invalidateAuthUserDocCache.mockImplementation(async () => {
      actions.push('cache:invalidated');
    });
    const lifecycle = createMongooseClerkWebhookLifecycle(dependencies);
    const deletedAt = new Date('2026-08-13T09:00:00.000Z');

    await lifecycle.tombstoneClerkUser({ clerkUserId: 'user_123', deletedAt });

    expect(methods.findClerkSessionIdsByClerkUserId).toHaveBeenCalledWith('user_123', {
      session: transaction,
    });
    expect(methods.tombstoneClerkUsers).toHaveBeenCalledWith(
      { clerkId: 'user_123', deletedAt },
      { session: transaction, deferCacheInvalidation: true },
    );
    expect(methods.deleteSessionsByClerkUserId).toHaveBeenCalledWith('user_123', {
      session: transaction,
    });
    expect(methods.invalidateAuthUserDocCache).toHaveBeenCalledWith('user_1');
    expect(actions).toEqual([
      'transaction:start',
      'users:tombstoned',
      'transaction:commit',
      'cache:invalidated',
    ]);
  });

  it('ends the Mongo session and skips cache invalidation when a transaction aborts', async () => {
    const { dependencies, methods, transaction } = createDependencies();
    transaction.withTransaction.mockRejectedValue(new Error('commit failed'));
    const lifecycle = createMongooseClerkWebhookLifecycle(dependencies);

    await expect(
      lifecycle.tombstoneClerkUser({
        clerkUserId: 'user_123',
        deletedAt: new Date('2026-08-13T09:00:00.000Z'),
      }),
    ).rejects.toThrow('commit failed');

    expect(transaction.endSession).toHaveBeenCalledTimes(1);
    expect(methods.invalidateAuthUserDocCache).not.toHaveBeenCalled();
  });
});

describe('createClerkWebhookRouteHandler', () => {
  it('composes verification, system scope, and the real persistence adapter', async () => {
    const transaction = {
      withTransaction: jest.fn(async (operation: () => Promise<void>) => operation()),
      endSession: jest.fn().mockResolvedValue(undefined),
    };
    const methods = {
      upsertSessionState: jest.fn().mockResolvedValue(undefined),
      upsertUserState: jest.fn().mockResolvedValue(undefined),
      findClerkSessionIdsByClerkUserId: jest.fn().mockResolvedValue([]),
      tombstoneClerkUsers: jest.fn().mockResolvedValue([]),
      deleteSessionsByClerkSessionId: jest.fn().mockResolvedValue(undefined),
      deleteSessionsByClerkUserId: jest.fn().mockResolvedValue(undefined),
      invalidateAuthUserDocCache: jest.fn().mockResolvedValue(undefined),
    };
    const runAsSystem = jest.fn(async (operation: () => Promise<void>) => operation());
    const recordOutcome = jest.fn();
    const handler = createClerkWebhookRouteHandler({
      startSession: jest.fn().mockResolvedValue(transaction),
      methods,
      runAsSystem,
      resolveConfig: () => ({ enabled: true, webhookSigningSecret: 'whsec_test' }),
      verifyWebhook: jest
        .fn()
        .mockResolvedValue({ type: 'session.revoked', data: { id: 'sess_1' } }),
      recordOutcome,
      logError: jest.fn(),
      now: () => new Date('2026-08-13T09:00:00.000Z'),
    });
    const app = express();
    app.post('/api/auth/clerk/webhook', express.raw({ type: 'application/json' }), handler);

    const response = await request(app)
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(204);
    expect(runAsSystem).toHaveBeenCalledTimes(1);
    expect(methods.upsertSessionState).toHaveBeenCalledWith(
      expect.objectContaining({ clerkSessionId: 'sess_1', state: 'revoked' }),
      { session: transaction },
    );
    expect(methods.deleteSessionsByClerkSessionId).toHaveBeenCalledWith('sess_1', {
      session: transaction,
    });
    expect(recordOutcome).toHaveBeenCalledWith('session_revoked', 'success');
  });
});

describe('createClerkWebhookHandler', () => {
  function createDependencies() {
    return {
      resolveConfig: jest.fn<ClerkWebhookConfig, []>(() => ({
        enabled: true as const,
        webhookSigningSecret: 'whsec_test',
      })),
      verifyWebhook: jest.fn(),
      runAsSystem: jest.fn(async (operation: () => Promise<void>) => operation()),
      revokeClerkSession: jest.fn().mockResolvedValue(undefined),
      tombstoneClerkUser: jest.fn().mockResolvedValue(undefined),
      recordOutcome: jest.fn(),
      logError: jest.fn(),
      now: jest.fn(() => new Date('2026-08-13T09:00:00.000Z')),
    };
  }

  function createApp(dependencies: ReturnType<typeof createDependencies>) {
    const app = express();
    app.post(
      '/api/auth/clerk/webhook',
      express.raw({ type: 'application/json' }),
      createClerkWebhookHandler(dependencies),
    );
    return app;
  }

  function createParsedBodyApp(dependencies: ReturnType<typeof createDependencies>) {
    const app = express();
    app.post('/api/auth/clerk/webhook', express.json(), createClerkWebhookHandler(dependencies));
    return app;
  }

  it('returns a stable unavailable response when Clerk is not configured', async () => {
    const dependencies = createDependencies();
    dependencies.resolveConfig.mockReturnValue({
      enabled: false,
    });

    const response = await request(createApp(dependencies))
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ code: 'CLERK_UNAVAILABLE' });
    expect(dependencies.verifyWebhook).not.toHaveBeenCalled();
    expect(dependencies.runAsSystem).not.toHaveBeenCalled();
    expect(dependencies.recordOutcome).toHaveBeenCalledWith('unknown', 'unavailable');
  });

  it('rejects an invalid signature before any system-scoped mutation', async () => {
    const dependencies = createDependencies();
    dependencies.verifyWebhook.mockRejectedValue(new Error('bad signature'));

    const response = await request(createApp(dependencies))
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .send('{"data":{"id":"sess_123"}}');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'CLERK_REQUEST_INVALID' });
    expect(dependencies.runAsSystem).not.toHaveBeenCalled();
    expect(dependencies.revokeClerkSession).not.toHaveBeenCalled();
    expect(dependencies.tombstoneClerkUser).not.toHaveBeenCalled();
    expect(dependencies.recordOutcome).toHaveBeenCalledWith('unknown', 'invalid');
  });

  it('rejects a body parsed before the handler without attempting verification', async () => {
    const dependencies = createDependencies();

    const response = await request(createParsedBodyApp(dependencies))
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .send({ type: 'session.revoked', data: { id: 'sess_123' } });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'CLERK_REQUEST_INVALID' });
    expect(dependencies.verifyWebhook).not.toHaveBeenCalled();
    expect(dependencies.runAsSystem).not.toHaveBeenCalled();
    expect(dependencies.recordOutcome).toHaveBeenCalledWith('unknown', 'invalid');
  });

  it('rejects a malformed supported verified event before any mutation', async () => {
    const dependencies = createDependencies();
    dependencies.verifyWebhook.mockResolvedValue({ type: 'session.revoked', data: {} });

    const response = await request(createApp(dependencies))
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ code: 'CLERK_REQUEST_INVALID' });
    expect(dependencies.runAsSystem).not.toHaveBeenCalled();
    expect(dependencies.recordOutcome).toHaveBeenCalledWith('unknown', 'invalid');
  });

  it('passes the byte-faithful request and configured secret to verification', async () => {
    const dependencies = createDependencies();
    dependencies.verifyWebhook.mockImplementation(async (verifiedRequest: Request) => {
      expect(verifiedRequest.method).toBe('POST');
      expect(verifiedRequest.headers.get('svix-id')).toBe('msg_test');
      expect(await verifiedRequest.text()).toBe('{"event":"raw"}');
      return { type: 'organization.updated', data: {} };
    });

    const response = await request(createApp(dependencies))
      .post('/api/auth/clerk/webhook?delivery=1')
      .set('Content-Type', 'application/json')
      .set('svix-id', 'msg_test')
      .send('{"event":"raw"}');

    expect(response.status).toBe(204);
    expect(dependencies.verifyWebhook).toHaveBeenCalledWith(expect.any(Request), {
      signingSecret: 'whsec_test',
    });
    expect(dependencies.runAsSystem).not.toHaveBeenCalled();
    expect(dependencies.recordOutcome).toHaveBeenCalledWith('unsupported', 'success');
  });

  it.each(['session.ended', 'session.revoked'] as const)(
    'revokes every local session correlated with a verified %s event',
    async (type) => {
      const dependencies = createDependencies();
      dependencies.verifyWebhook.mockResolvedValue({
        type,
        data: { id: 'sess_123' },
      });

      const response = await request(createApp(dependencies))
        .post('/api/auth/clerk/webhook')
        .set('Content-Type', 'application/json')
        .send('{}');

      expect(response.status).toBe(204);
      expect(dependencies.runAsSystem).toHaveBeenCalledTimes(1);
      expect(dependencies.revokeClerkSession).toHaveBeenCalledWith({
        clerkSessionId: 'sess_123',
        revokedAt: new Date('2026-08-13T09:00:00.000Z'),
      });
      expect(dependencies.tombstoneClerkUser).not.toHaveBeenCalled();
      expect(dependencies.recordOutcome).toHaveBeenCalledWith(
        type === 'session.ended' ? 'session_ended' : 'session_revoked',
        'success',
      );
    },
  );

  it('tombstones a Clerk user through the system-scoped lifecycle method', async () => {
    const dependencies = createDependencies();
    dependencies.verifyWebhook.mockResolvedValue({
      type: 'user.deleted',
      data: { id: 'user_123' },
    });

    const response = await request(createApp(dependencies))
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Tenant-Id', 'forged-tenant')
      .send('{}');

    expect(response.status).toBe(204);
    expect(dependencies.runAsSystem).toHaveBeenCalledTimes(1);
    expect(dependencies.tombstoneClerkUser).toHaveBeenCalledWith({
      clerkUserId: 'user_123',
      deletedAt: new Date('2026-08-13T09:00:00.000Z'),
    });
    expect(dependencies.revokeClerkSession).not.toHaveBeenCalled();
    expect(dependencies.recordOutcome).toHaveBeenCalledWith('user_deleted', 'success');
  });

  it('returns a stable internal response when a verified mutation fails', async () => {
    const dependencies = createDependencies();
    dependencies.verifyWebhook.mockResolvedValue({
      type: 'session.revoked',
      data: { id: 'sess_123' },
    });
    dependencies.revokeClerkSession.mockRejectedValue(new Error('database unavailable'));

    const response = await request(createApp(dependencies))
      .post('/api/auth/clerk/webhook')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ code: 'CLERK_LOGIN_FAILED' });
    expect(dependencies.logError).toHaveBeenCalledWith('Clerk webhook mutation failed');
    expect(dependencies.logError).toHaveBeenCalledTimes(1);
    expect(dependencies.recordOutcome).toHaveBeenCalledWith('session_revoked', 'mutation_failed');
  });
});
