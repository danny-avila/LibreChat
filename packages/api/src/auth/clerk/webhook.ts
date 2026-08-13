import { verifyWebhook } from '@clerk/backend/webhooks';
import type { RequestHandler } from 'express';
import { recordClerkWebhook, type ClerkWebhookEvent, type ClerkWebhookResult } from '~/app/metrics';
import { CLERK_CLOCK_SKEW_MS, MAX_CLERK_TOKEN_LIFETIME_MS } from './verify';
import { resolveClerkAuthConfig } from './config';

export interface ClerkWebhookRequestInput {
  body: Uint8Array;
  method: string;
  url: string;
  headers: ReadonlyArray<readonly [string, string]>;
}

export type NarrowedClerkWebhookEvent =
  | { kind: 'unsupported' }
  | {
      kind: 'session_revoked';
      event: 'session_ended' | 'session_revoked';
      clerkSessionId: string;
      occurredAt: Date;
    }
  | { kind: 'user_deleted'; clerkUserId: string; occurredAt: Date };

export type ClerkWebhookConfig =
  | { enabled: false }
  | { enabled: true; webhookSigningSecret: string };

export interface ClerkWebhookHandlerDependencies {
  resolveConfig: () => ClerkWebhookConfig;
  verifyWebhook: (request: Request, options: { signingSecret: string }) => Promise<unknown>;
  runAsSystem: (operation: () => Promise<void>) => Promise<void>;
  revokeClerkSession: (input: { clerkSessionId: string; revokedAt: Date }) => Promise<void>;
  tombstoneClerkUser: (input: { clerkUserId: string; deletedAt: Date }) => Promise<void>;
  recordOutcome: (event: ClerkWebhookEvent, result: ClerkWebhookResult) => void;
  logError: (message: string) => void;
  now: () => Date;
}

interface RevokedClerkSessionState {
  clerkSessionId: string;
  state: 'revoked';
  revokedAt: Date;
  expiration: Date;
}

interface DeletedClerkUserState {
  clerkUserId: string;
  state: 'deleted';
  deletedAt: Date;
  expiration: Date;
}

export interface ClerkWebhookLifecycleDependencies<Transaction> {
  withTransaction: (operation: (transaction: Transaction) => Promise<void>) => Promise<void>;
  upsertSessionState: (input: RevokedClerkSessionState, transaction: Transaction) => Promise<void>;
  upsertUserState: (input: DeletedClerkUserState, transaction: Transaction) => Promise<void>;
  findClerkSessionIdsByUser: (
    clerkUserId: string,
    transaction: Transaction,
  ) => Promise<readonly string[]>;
  tombstoneUsersByClerkId: (
    clerkUserId: string,
    deletedAt: Date,
    transaction: Transaction,
  ) => Promise<readonly string[]>;
  deleteSessionsByClerkSessionId: (
    clerkSessionId: string,
    transaction: Transaction,
  ) => Promise<void>;
  deleteSessionsByClerkUserId: (clerkUserId: string, transaction: Transaction) => Promise<void>;
  invalidateAuthUserDocuments: (userIds: readonly string[]) => Promise<void>;
}

export interface ClerkWebhookLifecycle {
  revokeClerkSession: (input: { clerkSessionId: string; revokedAt: Date }) => Promise<void>;
  tombstoneClerkUser: (input: { clerkUserId: string; deletedAt: Date }) => Promise<void>;
}

export interface ClerkWebhookMongoSession {
  withTransaction: (operation: () => Promise<void>) => Promise<unknown>;
  endSession: () => Promise<void>;
}

export interface ClerkWebhookPersistenceMethods<Transaction> {
  upsertSessionState: (
    input: RevokedClerkSessionState,
    options: { session: Transaction },
  ) => Promise<unknown>;
  upsertUserState: (
    input: DeletedClerkUserState,
    options: { session: Transaction },
  ) => Promise<unknown>;
  findClerkSessionIdsByClerkUserId: (
    clerkUserId: string,
    options: { session: Transaction },
  ) => Promise<readonly string[]>;
  tombstoneClerkUsers: (
    input: { clerkId: string; deletedAt: Date },
    options: { session: Transaction; deferCacheInvalidation: true },
  ) => Promise<readonly string[]>;
  deleteSessionsByClerkSessionId: (
    clerkSessionId: string,
    options: { session: Transaction },
  ) => Promise<unknown>;
  deleteSessionsByClerkUserId: (
    clerkUserId: string,
    options: { session: Transaction },
  ) => Promise<unknown>;
  invalidateAuthUserDocCache: (userId: string) => Promise<void>;
}

export interface MongooseClerkWebhookLifecycleDependencies<
  Transaction extends ClerkWebhookMongoSession,
> {
  startSession: () => Promise<Transaction>;
  methods: ClerkWebhookPersistenceMethods<Transaction>;
}

export interface ClerkWebhookRouteHandlerDependencies<Transaction extends ClerkWebhookMongoSession>
  extends MongooseClerkWebhookLifecycleDependencies<Transaction> {
  runAsSystem: ClerkWebhookHandlerDependencies['runAsSystem'];
  logError: ClerkWebhookHandlerDependencies['logError'];
  resolveConfig?: ClerkWebhookHandlerDependencies['resolveConfig'];
  verifyWebhook?: ClerkWebhookHandlerDependencies['verifyWebhook'];
  recordOutcome?: ClerkWebhookHandlerDependencies['recordOutcome'];
  now?: ClerkWebhookHandlerDependencies['now'];
}

const INVALID_CLERK_WEBHOOK_EVENT = 'Invalid Clerk webhook event';

function readProperty(value: object, property: PropertyKey): unknown {
  return Reflect.get(value, property);
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function requireIdentifier(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(INVALID_CLERK_WEBHOOK_EVENT);
  }
  return value.trim();
}

function requireOccurredAt(value: Date): Date {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(INVALID_CLERK_WEBHOOK_EVENT);
  }
  return new Date(value);
}

function getStateExpiration(occurredAt: Date): Date {
  return new Date(occurredAt.getTime() + MAX_CLERK_TOKEN_LIFETIME_MS + CLERK_CLOCK_SKEW_MS);
}

function uniqueSessionIds(sessionIds: readonly string[]): readonly string[] {
  return [...new Set(sessionIds.filter((sessionId) => sessionId.trim().length > 0))];
}

function getWebhookEventLabel(
  event: Exclude<NarrowedClerkWebhookEvent, { kind: 'unsupported' }>,
): ClerkWebhookEvent {
  return event.kind === 'session_revoked' ? event.event : 'user_deleted';
}

function getSigningSecret(
  resolveConfig: ClerkWebhookHandlerDependencies['resolveConfig'],
): string | undefined {
  try {
    const config = resolveConfig();
    if (!config.enabled || config.webhookSigningSecret.trim().length === 0) {
      return undefined;
    }
    return config.webhookSigningSecret;
  } catch {
    return undefined;
  }
}

function pairRawHeaders(
  rawHeaders: readonly string[],
): Array<readonly [string, string]> | undefined {
  if (rawHeaders.length % 2 !== 0) {
    return undefined;
  }

  const headers: Array<readonly [string, string]> = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    headers.push([rawHeaders[index], rawHeaders[index + 1]]);
  }
  return headers;
}

async function applyWebhookEvent(
  event: Exclude<NarrowedClerkWebhookEvent, { kind: 'unsupported' }>,
  dependencies: ClerkWebhookHandlerDependencies,
): Promise<void> {
  if (event.kind === 'session_revoked') {
    await dependencies.revokeClerkSession({
      clerkSessionId: event.clerkSessionId,
      revokedAt: event.occurredAt,
    });
    return;
  }

  await dependencies.tombstoneClerkUser({
    clerkUserId: event.clerkUserId,
    deletedAt: event.occurredAt,
  });
}

export function createClerkWebhookLifecycle<Transaction>(
  dependencies: ClerkWebhookLifecycleDependencies<Transaction>,
): ClerkWebhookLifecycle {
  async function revokeClerkSession(input: {
    clerkSessionId: string;
    revokedAt: Date;
  }): Promise<void> {
    const expiration = getStateExpiration(input.revokedAt);
    await dependencies.withTransaction(async (transaction) => {
      await dependencies.upsertSessionState(
        {
          clerkSessionId: input.clerkSessionId,
          state: 'revoked',
          revokedAt: input.revokedAt,
          expiration,
        },
        transaction,
      );
      await dependencies.deleteSessionsByClerkSessionId(input.clerkSessionId, transaction);
    });
  }

  async function tombstoneClerkUser(input: {
    clerkUserId: string;
    deletedAt: Date;
  }): Promise<void> {
    const expiration = getStateExpiration(input.deletedAt);
    let affectedUserIds: readonly string[] = [];

    await dependencies.withTransaction(async (transaction) => {
      await dependencies.upsertUserState(
        {
          clerkUserId: input.clerkUserId,
          state: 'deleted',
          deletedAt: input.deletedAt,
          expiration,
        },
        transaction,
      );

      const sessionIds = uniqueSessionIds(
        await dependencies.findClerkSessionIdsByUser(input.clerkUserId, transaction),
      );
      for (const clerkSessionId of sessionIds) {
        await dependencies.upsertSessionState(
          {
            clerkSessionId,
            state: 'revoked',
            revokedAt: input.deletedAt,
            expiration,
          },
          transaction,
        );
      }

      affectedUserIds = await dependencies.tombstoneUsersByClerkId(
        input.clerkUserId,
        input.deletedAt,
        transaction,
      );
      await dependencies.deleteSessionsByClerkUserId(input.clerkUserId, transaction);
    });

    await dependencies.invalidateAuthUserDocuments(affectedUserIds);
  }

  return { revokeClerkSession, tombstoneClerkUser };
}

export function createMongooseClerkWebhookLifecycle<Transaction extends ClerkWebhookMongoSession>(
  dependencies: MongooseClerkWebhookLifecycleDependencies<Transaction>,
): ClerkWebhookLifecycle {
  const { methods } = dependencies;

  return createClerkWebhookLifecycle<Transaction>({
    withTransaction: async (operation) => {
      const session = await dependencies.startSession();
      try {
        await session.withTransaction(() => operation(session));
      } finally {
        await session.endSession();
      }
    },
    upsertSessionState: async (input, session) => {
      await methods.upsertSessionState(input, { session });
    },
    upsertUserState: async (input, session) => {
      await methods.upsertUserState(input, { session });
    },
    findClerkSessionIdsByUser: (clerkUserId, session) =>
      methods.findClerkSessionIdsByClerkUserId(clerkUserId, { session }),
    tombstoneUsersByClerkId: (clerkId, deletedAt, session) =>
      methods.tombstoneClerkUsers(
        { clerkId, deletedAt },
        { session, deferCacheInvalidation: true },
      ),
    deleteSessionsByClerkSessionId: async (clerkSessionId, session) => {
      await methods.deleteSessionsByClerkSessionId(clerkSessionId, { session });
    },
    deleteSessionsByClerkUserId: async (clerkUserId, session) => {
      await methods.deleteSessionsByClerkUserId(clerkUserId, { session });
    },
    invalidateAuthUserDocuments: async (userIds) => {
      await Promise.all(userIds.map((userId) => methods.invalidateAuthUserDocCache(userId)));
    },
  });
}

export function createClerkWebhookRouteHandler<Transaction extends ClerkWebhookMongoSession>(
  dependencies: ClerkWebhookRouteHandlerDependencies<Transaction>,
): RequestHandler<Record<string, never>, unknown, unknown> {
  const lifecycle = createMongooseClerkWebhookLifecycle(dependencies);
  return createClerkWebhookHandler({
    resolveConfig: dependencies.resolveConfig ?? resolveClerkAuthConfig,
    verifyWebhook: dependencies.verifyWebhook ?? verifyClerkWebhookRequest,
    runAsSystem: dependencies.runAsSystem,
    revokeClerkSession: lifecycle.revokeClerkSession,
    tombstoneClerkUser: lifecycle.tombstoneClerkUser,
    recordOutcome: dependencies.recordOutcome ?? recordClerkWebhook,
    logError: dependencies.logError,
    now: dependencies.now ?? (() => new Date()),
  });
}

export function createClerkWebhookRequest(input: ClerkWebhookRequestInput): Request {
  const headers = new Headers();
  for (const [name, value] of input.headers) {
    headers.append(name, value);
  }

  return new Request(input.url, {
    body: Uint8Array.from(input.body),
    headers,
    method: input.method,
  });
}

export function verifyClerkWebhookRequest(
  request: Request,
  options: { signingSecret: string },
): Promise<unknown> {
  return verifyWebhook(request, options);
}

export function narrowClerkWebhookEvent(
  event: unknown,
  occurredAt: Date,
): NarrowedClerkWebhookEvent {
  if (!isObject(event)) {
    throw new Error(INVALID_CLERK_WEBHOOK_EVENT);
  }

  const type = readProperty(event, 'type');
  if (typeof type !== 'string' || type.trim().length === 0) {
    throw new Error(INVALID_CLERK_WEBHOOK_EVENT);
  }

  if (type !== 'session.ended' && type !== 'session.revoked' && type !== 'user.deleted') {
    return { kind: 'unsupported' };
  }

  const data = readProperty(event, 'data');
  if (!isObject(data)) {
    throw new Error(INVALID_CLERK_WEBHOOK_EVENT);
  }

  const verifiedAt = requireOccurredAt(occurredAt);
  const id = requireIdentifier(readProperty(data, 'id'));

  if (type === 'user.deleted') {
    return { kind: 'user_deleted', clerkUserId: id, occurredAt: verifiedAt };
  }

  return {
    kind: 'session_revoked',
    event: type === 'session.ended' ? 'session_ended' : 'session_revoked',
    clerkSessionId: id,
    occurredAt: verifiedAt,
  };
}

export function createClerkWebhookHandler(
  dependencies: ClerkWebhookHandlerDependencies,
): RequestHandler<Record<string, never>, unknown, unknown> {
  return async (request, response) => {
    const signingSecret = getSigningSecret(dependencies.resolveConfig);
    if (signingSecret == null) {
      dependencies.recordOutcome('unknown', 'unavailable');
      response.status(503).json({ code: 'CLERK_UNAVAILABLE' });
      return;
    }

    const headers = pairRawHeaders(request.rawHeaders);
    const host = request.get('host');
    if (!Buffer.isBuffer(request.body) || headers == null || host == null) {
      dependencies.recordOutcome('unknown', 'invalid');
      response.status(400).json({ code: 'CLERK_REQUEST_INVALID' });
      return;
    }

    let event: NarrowedClerkWebhookEvent;
    try {
      const verifiedEvent = await dependencies.verifyWebhook(
        createClerkWebhookRequest({
          body: request.body,
          headers,
          method: request.method,
          url: `${request.protocol}://${host}${request.originalUrl}`,
        }),
        { signingSecret },
      );
      event = narrowClerkWebhookEvent(verifiedEvent, dependencies.now());
    } catch {
      dependencies.recordOutcome('unknown', 'invalid');
      response.status(400).json({ code: 'CLERK_REQUEST_INVALID' });
      return;
    }

    if (event.kind === 'unsupported') {
      dependencies.recordOutcome('unsupported', 'success');
      response.status(204).end();
      return;
    }

    try {
      await dependencies.runAsSystem(() => applyWebhookEvent(event, dependencies));
    } catch {
      dependencies.recordOutcome(getWebhookEventLabel(event), 'mutation_failed');
      dependencies.logError('Clerk webhook mutation failed');
      response.status(500).json({ code: 'CLERK_LOGIN_FAILED' });
      return;
    }

    dependencies.recordOutcome(getWebhookEventLabel(event), 'success');
    response.status(204).end();
  };
}
