import type { ClerkSessionContext, IUser } from '@librechat/data-schemas';
import type {
  ClerkSessionCompletionDependencies,
  ConfirmClerkSessionInput,
  PersistClerkSessionInput,
  PersistedClerkSession,
} from './session';
import { ClerkRouteError } from './handler';

export const CLERK_SESSION_TRANSACTION_TIMEOUT_MS: number = 10_000;

interface ActiveClerkUserState {
  clerkUserId: string;
  state: 'active';
  expiration: Date;
}

interface ActiveClerkSessionState {
  clerkSessionId: string;
  state: 'active';
  expiration: Date;
}

interface ConsumedClerkTokenClaim {
  tenantScope: string;
  clerkTokenId: string;
  sourceClerkSessionId: string;
  sourceClerkUserId: string;
  expiration: Date;
}

type ClerkTenantCriterion = string | { $exists: false };

interface ClerkExchangeUserCriteria {
  _id: string;
  clerkId: string;
  clerkDeletedAt: { $exists: false };
  tenantId: ClerkTenantCriterion;
}

interface ConfirmableClerkSession extends PersistedClerkSession {
  authProvider?: 'clerk';
  tenantId?: string;
  absoluteExpiresAt?: Date;
}

interface CreatedClerkSessionResult {
  session: Partial<PersistedClerkSession>;
  refreshToken: string;
}

export interface ClerkSessionMongoSession {
  withTransaction: <Result>(
    operation: () => Promise<Result>,
    options: { timeoutMS: number },
  ) => Promise<Result>;
  endSession: () => Promise<void>;
}

export interface ClerkSessionPersistenceMethods<Transaction> {
  findUser: (
    searchCriteria: ClerkExchangeUserCriteria,
    fieldsToSelect: string | string[] | null,
    options: { session: Transaction },
  ) => Promise<IUser | null>;
  upsertUserState: (
    input: ActiveClerkUserState,
    options: { session: Transaction },
  ) => Promise<unknown>;
  upsertSessionState: (
    input: ActiveClerkSessionState,
    options: { session: Transaction },
  ) => Promise<unknown>;
  insertConsumedTokenClaim: (
    input: ConsumedClerkTokenClaim,
    options: { session: Transaction },
  ) => Promise<unknown>;
  createSession: (
    userId: string,
    options: { clerk: ClerkSessionContext; dbSession: Transaction },
  ) => Promise<CreatedClerkSessionResult>;
  findSession: (
    input: { sessionId: string; tenantId?: string },
    options: { lean: true; includeExpired: true },
  ) => Promise<ConfirmableClerkSession | null>;
  deleteSession: (input: { sessionId: string }) => Promise<unknown>;
}

export interface MongooseClerkSessionPersistenceDependencies<
  Transaction extends ClerkSessionMongoSession,
> {
  startSession: () => Promise<Transaction>;
  methods: ClerkSessionPersistenceMethods<Transaction>;
  now: () => Date;
}

export type ClerkSessionPersistence = Pick<
  ClerkSessionCompletionDependencies,
  'persistClerkSession' | 'confirmClerkSession' | 'deleteSession'
>;

function tenantCriterion(tenantId: string | undefined): ClerkTenantCriterion {
  return typeof tenantId === 'string' && tenantId.trim().length > 0 ? tenantId : { $exists: false };
}

function exchangeUserCriteria(input: PersistClerkSessionInput): ClerkExchangeUserCriteria {
  return {
    _id: input.userId,
    clerkId: input.clerk.clerkUserId,
    clerkDeletedAt: { $exists: false },
    tenantId: tenantCriterion(input.tenantId),
  };
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isPersistedSession(
  session: Partial<PersistedClerkSession>,
): session is PersistedClerkSession {
  return Boolean(session._id?.toString().trim()) && isValidDate(session.expiration);
}

function requirePersistedSession(session: Partial<PersistedClerkSession>): PersistedClerkSession {
  if (!isPersistedSession(session)) {
    throw new ClerkRouteError('CLERK_LOGIN_FAILED', 500);
  }
  return session;
}

function isConfirmedClerkSession(
  session: ConfirmableClerkSession | null,
  input: ConfirmClerkSessionInput,
  now: Date,
): boolean {
  if (
    session?.authProvider !== 'clerk' ||
    session.tenantId !== input.tenantId ||
    !isValidDate(session.expiration) ||
    !isValidDate(session.absoluteExpiresAt)
  ) {
    return false;
  }
  return (
    session.expiration.getTime() === session.absoluteExpiresAt.getTime() &&
    session.absoluteExpiresAt.getTime() > now.getTime()
  );
}

/**
 * Production persistence boundary for Fixed Contract 7. The legacy route
 * injects model functions only; this typed adapter owns transaction lifetime,
 * fence/claim ordering, correlated Session creation, post-commit confirmation,
 * and exact compensation deletion.
 */
export function createMongooseClerkSessionPersistence<Transaction extends ClerkSessionMongoSession>(
  dependencies: MongooseClerkSessionPersistenceDependencies<Transaction>,
): ClerkSessionPersistence {
  const { methods } = dependencies;

  async function persistClerkSession(
    input: PersistClerkSessionInput,
  ): Promise<PersistedClerkSession> {
    const mongoSession = await dependencies.startSession();
    try {
      return await mongoSession.withTransaction(
        async () => {
          const user = await methods.findUser(exchangeUserCriteria(input), null, {
            session: mongoSession,
          });
          if (!user) {
            throw new ClerkRouteError('CLERK_LOGIN_FORBIDDEN', 403);
          }

          await methods.upsertUserState(
            {
              clerkUserId: input.clerk.clerkUserId,
              state: 'active',
              expiration: input.claimExpiresAt,
            },
            { session: mongoSession },
          );
          await methods.upsertSessionState(
            {
              clerkSessionId: input.clerk.clerkSessionId,
              state: 'active',
              expiration: input.claimExpiresAt,
            },
            { session: mongoSession },
          );
          await methods.insertConsumedTokenClaim(
            {
              tenantScope: input.clerk.tenantScope,
              clerkTokenId: input.clerk.clerkTokenId,
              sourceClerkSessionId: input.clerk.clerkSessionId,
              sourceClerkUserId: input.clerk.clerkUserId,
              expiration: input.claimExpiresAt,
            },
            { session: mongoSession },
          );
          const created = await methods.createSession(input.userId, {
            clerk: input.clerk,
            dbSession: mongoSession,
          });
          return requirePersistedSession(created.session);
        },
        { timeoutMS: CLERK_SESSION_TRANSACTION_TIMEOUT_MS },
      );
    } finally {
      await mongoSession.endSession();
    }
  }

  async function confirmClerkSession(input: ConfirmClerkSessionInput): Promise<boolean> {
    const session = await methods.findSession(
      { sessionId: input.sessionId, tenantId: input.tenantId },
      { lean: true, includeExpired: true },
    );
    return isConfirmedClerkSession(session, input, dependencies.now());
  }

  async function deleteSession(sessionId: string): Promise<void> {
    await methods.deleteSession({ sessionId });
  }

  return { persistClerkSession, confirmClerkSession, deleteSession };
}
