import { isMainThread } from 'node:worker_threads';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  logger,
  configCapability,
  SystemCapabilities,
  readConfigCapability,
} from '@librechat/data-schemas';
import type { PrincipalType } from 'librechat-data-provider';
import type { SystemCapability, ConfigSection } from '@librechat/data-schemas';
import type { NextFunction, Response } from 'express';
import type { Types } from 'mongoose';
import type { ServerRequest } from '~/types/http';

interface ResolvedPrincipal {
  principalType: PrincipalType;
  principalId?: string | Types.ObjectId;
}

interface CapabilityDeps {
  getUserPrincipals: (params: { userId: string; role: string }) => Promise<ResolvedPrincipal[]>;
  hasCapabilityForPrincipals: (params: {
    principals: ResolvedPrincipal[];
    capability: SystemCapability;
    tenantId?: string;
  }) => Promise<boolean>;
}

interface CapabilityUser {
  id: string;
  role: string;
  tenantId?: string;
}

interface CapabilityStore {
  principals: Map<string, ResolvedPrincipal[]>;
  results: Map<string, boolean>;
}

export type HasCapabilityFn = (
  user: CapabilityUser,
  capability: SystemCapability,
) => Promise<boolean>;

export type RequireCapabilityFn = (
  capability: SystemCapability,
) => (req: ServerRequest, res: Response, next: NextFunction) => Promise<void>;

export type HasConfigCapabilityFn = (
  user: CapabilityUser,
  section: ConfigSection,
  verb?: 'manage' | 'read',
) => Promise<boolean>;

/**
 * Per-request store for caching resolved principals and capability check results.
 * When running inside an Express request (via `capabilityContextMiddleware`),
 * duplicate `hasCapability` calls within the same request are served from
 * the in-memory Map instead of hitting the database again.
 * Outside a request context (background jobs, tests), the store is undefined
 * and every check falls through to the database — correct behavior.
 */
export const capabilityStore = new AsyncLocalStorage<CapabilityStore>();

export function capabilityContextMiddleware(
  _req: ServerRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!isMainThread) {
    logger.error(
      '[capabilityContextMiddleware] Mounted in a worker thread — ' +
        'ALS context will not propagate to the main thread or other workers. ' +
        'This middleware should only run in the main Express process.',
    );
  }
  capabilityStore.run({ principals: new Map(), results: new Map() }, next);
}

/**
 * Factory that creates `hasCapability` and `requireCapability` with injected
 * database methods. Follows the same dependency-injection pattern as
 * `generateCheckAccess`.
 */
export function generateCapabilityCheck(deps: CapabilityDeps): {
  hasCapability: HasCapabilityFn;
  requireCapability: RequireCapabilityFn;
  hasConfigCapability: HasConfigCapabilityFn;
} {
  const { getUserPrincipals, hasCapabilityForPrincipals } = deps;

  let workerWarned = false;

  async function hasCapability(
    user: CapabilityUser,
    capability: SystemCapability,
  ): Promise<boolean> {
    if (!isMainThread && !workerWarned) {
      workerWarned = true;
      logger.warn(
        '[hasCapability] Called from a worker thread — ALS context is unavailable. ' +
          'Capability checks will hit the database on every call (no per-request caching). ' +
          'If this is intentional, no action needed.',
      );
    }

    const store = capabilityStore.getStore();

    const resultKey = `${user.id}:${user.tenantId ?? ''}:${capability}`;
    const cached = store?.results.get(resultKey);
    if (cached !== undefined) {
      return cached;
    }

    const principalKey = `${user.id}:${user.role}:${user.tenantId ?? ''}`;
    let principals: ResolvedPrincipal[];
    const cachedPrincipals = store?.principals.get(principalKey);
    if (cachedPrincipals) {
      principals = cachedPrincipals;
    } else {
      principals = await getUserPrincipals({ userId: user.id, role: user.role });
      store?.principals.set(principalKey, principals);
    }

    const result = await hasCapabilityForPrincipals({
      principals,
      capability,
      tenantId: user.tenantId,
    });
    store?.results.set(resultKey, result);
    return result;
  }

  /**
   * Checks if a user can manage or read a specific config section.
   * First checks the broad capability (manage:configs / read:configs),
   * then falls back to the section-specific capability (manage:configs:<section>).
   */
  async function hasConfigCapability(
    user: CapabilityUser,
    section: ConfigSection,
    verb: 'manage' | 'read' = 'manage',
  ): Promise<boolean> {
    const broadCap =
      verb === 'manage' ? SystemCapabilities.MANAGE_CONFIGS : SystemCapabilities.READ_CONFIGS;
    if (await hasCapability(user, broadCap)) {
      return true;
    }
    const sectionCap =
      verb === 'manage' ? configCapability(section) : readConfigCapability(section);
    return hasCapability(user, sectionCap);
  }

  function requireCapability(capability: SystemCapability) {
    return async (req: ServerRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.user) {
          res.status(401).json({ message: 'Authentication required' });
          return;
        }

        const id = req.user.id ?? req.user._id?.toString();
        if (!id) {
          res.status(401).json({ message: 'Authentication required' });
          return;
        }

        const user: CapabilityUser = {
          id,
          role: req.user.role ?? '',
          tenantId: (req.user as CapabilityUser).tenantId,
        };

        if (await hasCapability(user, capability)) {
          next();
          return;
        }

        res.status(403).json({ message: 'Forbidden' });
      } catch (err) {
        logger.error(`[requireCapability] Error checking capability: ${capability}`, err);
        res.status(500).json({ message: 'Internal Server Error' });
      }
    };
  }

  return { hasCapability, requireCapability, hasConfigCapability };
}
