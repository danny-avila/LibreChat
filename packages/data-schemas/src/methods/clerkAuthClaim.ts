import type { ClientSession, Model } from 'mongoose';
import type * as t from '~/types';
import { CLERK_TENANTLESS_SCOPE } from '~/types';

export class ClerkAuthClaimError extends Error {
  public code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ClerkAuthClaimError';
    this.code = code;
  }
}

export interface ClerkAuthClaimMethodOptions {
  session?: ClientSession;
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

/** Normalizes a LibreChat tenant ID (or absence of one) to a claim-storable string. */
export function toClerkTenantScope(tenantId?: string | null): string {
  return tenantId != null && tenantId.trim().length > 0 ? tenantId : CLERK_TENANTLESS_SCOPE;
}

export function createClerkAuthClaimMethods(mongoose: typeof import('mongoose')): {
  insertConsumedTokenClaim: (
    input: Omit<t.ClerkConsumedTokenInput, 'kind'>,
    options?: ClerkAuthClaimMethodOptions,
  ) => Promise<t.IClerkAuthClaim>;
  findConsumedTokenClaim: (
    tenantScope: string,
    clerkTokenId: string,
  ) => Promise<t.IClerkAuthClaim | null>;
  upsertSessionState: (
    input: Omit<t.ClerkSessionStateInput, 'kind'>,
    options?: ClerkAuthClaimMethodOptions,
  ) => Promise<t.IClerkAuthClaim>;
  findSessionState: (clerkSessionId: string) => Promise<t.IClerkAuthClaim | null>;
  upsertUserState: (
    input: Omit<t.ClerkUserStateInput, 'kind'>,
    options?: ClerkAuthClaimMethodOptions,
  ) => Promise<t.IClerkAuthClaim>;
  findUserState: (clerkUserId: string) => Promise<t.IClerkAuthClaim | null>;
} {
  function model(): Model<t.IClerkAuthClaim> {
    return mongoose.models.ClerkAuthClaim as Model<t.IClerkAuthClaim>;
  }

  /**
   * Inserts the durable consumed-token claim. The unique
   * `(tenantScope, clerkTokenId)` partial index is the replay fence — a
   * duplicate here means this Clerk token ID was already exchanged for this
   * tenant, mapped to a stable error rather than a generic creation failure.
   */
  async function insertConsumedTokenClaim(
    input: Omit<t.ClerkConsumedTokenInput, 'kind'>,
    options: ClerkAuthClaimMethodOptions = {},
  ): Promise<t.IClerkAuthClaim> {
    try {
      const [doc] = await model().create([{ kind: 'consumed_token', ...input }], {
        session: options.session,
      });
      return doc;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ClerkAuthClaimError(
          `Clerk token "${input.clerkTokenId}" was already exchanged for this tenant`,
          'CLERK_TOKEN_REPLAYED',
        );
      }
      throw error;
    }
  }

  async function findConsumedTokenClaim(
    tenantScope: string,
    clerkTokenId: string,
  ): Promise<t.IClerkAuthClaim | null> {
    return model()
      .findOne({ kind: 'consumed_token', tenantScope, clerkTokenId })
      .lean<t.IClerkAuthClaim>();
  }

  /**
   * Upserts the global session_state claim. The transition is forward-only —
   * once `revoked`, an `active` upsert can never resurrect it — enforced by
   * scoping the `active` upsert's filter to documents that are not revoked.
   */
  async function upsertSessionState(
    input: Omit<t.ClerkSessionStateInput, 'kind'>,
    options: ClerkAuthClaimMethodOptions = {},
  ): Promise<t.IClerkAuthClaim> {
    const filter =
      input.state === 'active'
        ? {
            kind: 'session_state' as const,
            clerkSessionId: input.clerkSessionId,
            state: { $ne: 'revoked' },
          }
        : { kind: 'session_state' as const, clerkSessionId: input.clerkSessionId };
    const update =
      input.state === 'active'
        ? {
            $set: {
              kind: 'session_state',
              clerkSessionId: input.clerkSessionId,
              state: 'active',
            },
            /**
             * The fence must never shrink: a later cross-tab exchange with a
             * shorter remaining lifetime must not pull the shared fence's
             * expiration earlier than an already-accepted longer-lived one.
             * `$max` extends monotonically instead of overwriting.
             */
            $max: { expiration: input.expiration },
            $unset: { revokedAt: '' },
          }
        : {
            $set: {
              kind: 'session_state',
              clerkSessionId: input.clerkSessionId,
              state: 'revoked',
              revokedAt: input.revokedAt,
              expiration: input.expiration,
            },
          };
    const updated = await model()
      .findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
        runValidators: true,
        session: options.session,
      })
      .catch((error) => {
        if (isDuplicateKeyError(error)) {
          throw new ClerkAuthClaimError(
            `Clerk session "${input.clerkSessionId}" is already revoked`,
            'CLERK_SESSION_REVOKED',
          );
        }
        throw error;
      });
    if (!updated) {
      throw new ClerkAuthClaimError(
        `Clerk session "${input.clerkSessionId}" is already revoked`,
        'CLERK_SESSION_REVOKED',
      );
    }
    return updated;
  }

  async function findSessionState(clerkSessionId: string): Promise<t.IClerkAuthClaim | null> {
    return model().findOne({ kind: 'session_state', clerkSessionId }).lean<t.IClerkAuthClaim>();
  }

  /**
   * Upserts the global user_state claim. Forward-only, mirroring
   * `upsertSessionState`: once `deleted`, an `active` upsert can never
   * resurrect it (a Clerk deletion tombstones; it never un-deletes).
   */
  async function upsertUserState(
    input: Omit<t.ClerkUserStateInput, 'kind'>,
    options: ClerkAuthClaimMethodOptions = {},
  ): Promise<t.IClerkAuthClaim> {
    const filter =
      input.state === 'active'
        ? {
            kind: 'user_state' as const,
            clerkUserId: input.clerkUserId,
            state: { $ne: 'deleted' },
          }
        : { kind: 'user_state' as const, clerkUserId: input.clerkUserId };
    const update =
      input.state === 'active'
        ? {
            $set: {
              kind: 'user_state',
              clerkUserId: input.clerkUserId,
              state: 'active',
            },
            /** See `upsertSessionState` — the fence must never shrink. */
            $max: { expiration: input.expiration },
            $unset: { deletedAt: '' },
          }
        : {
            $set: {
              kind: 'user_state',
              clerkUserId: input.clerkUserId,
              state: 'deleted',
              deletedAt: input.deletedAt,
              expiration: input.expiration,
            },
          };
    const updated = await model()
      .findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
        runValidators: true,
        session: options.session,
      })
      .catch((error) => {
        if (isDuplicateKeyError(error)) {
          throw new ClerkAuthClaimError(
            `Clerk user "${input.clerkUserId}" is already deleted`,
            'CLERK_USER_DELETED',
          );
        }
        throw error;
      });
    if (!updated) {
      throw new ClerkAuthClaimError(
        `Clerk user "${input.clerkUserId}" is already deleted`,
        'CLERK_USER_DELETED',
      );
    }
    return updated;
  }

  async function findUserState(clerkUserId: string): Promise<t.IClerkAuthClaim | null> {
    return model().findOne({ kind: 'user_state', clerkUserId }).lean<t.IClerkAuthClaim>();
  }

  return {
    insertConsumedTokenClaim,
    findConsumedTokenClaim,
    upsertSessionState,
    findSessionState,
    upsertUserState,
    findUserState,
  };
}

export type ClerkAuthClaimMethods = ReturnType<typeof createClerkAuthClaimMethods>;
