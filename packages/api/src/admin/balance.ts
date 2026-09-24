import { logger, isValidObjectIdString } from '@librechat/data-schemas';
import type {
  RecordAuditEntryInput,
  RecordAuditEntryOptions,
  IBalance,
} from '@librechat/data-schemas';
import type { TAdminBalanceListItem, TAdminBalance } from 'librechat-data-provider';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { parsePagination } from './pagination';
import { buildAuditContext } from './context';

const MAX_REASON_LENGTH = 500;

interface TopUpRequestBody {
  credits?: number;
  reason?: string;
}

export interface AdminBalanceDeps {
  findBalanceByUser: (
    user: string,
    options?: { includeReservedCredits?: boolean },
  ) => Promise<IBalance | null>;
  updateBalance: (params: { user: string; incrementValue: number }) => Promise<IBalance>;
  findUser: (
    searchCriteria: { _id: string },
    fieldsToSelect?: string,
  ) => Promise<{ tenantId?: string } | null>;
  listBalances: (options: { limit: number; offset: number; tenantId?: string }) => Promise<{
    balances: TAdminBalanceListItem[];
    total: number;
  }>;
  recordAuditEntry?: (
    input: RecordAuditEntryInput,
    options?: RecordAuditEntryOptions,
  ) => Promise<void>;
  /** Opt-in: fail the top-up request if its audit entry can't be persisted. */
  auditFailClosed?: boolean;
}

function toAdminBalance(userId: string, balance: IBalance): TAdminBalance {
  return {
    userId,
    tokenCredits: balance.tokenCredits ?? 0,
    autoRefillEnabled: balance.autoRefillEnabled ?? false,
    refillIntervalValue: balance.refillIntervalValue ?? 0,
    refillIntervalUnit: balance.refillIntervalUnit ?? 'days',
    refillAmount: balance.refillAmount ?? 0,
    lastRefill: balance.lastRefill?.toISOString(),
  };
}

export function createAdminBalanceHandlers(deps: AdminBalanceDeps): {
  getUserBalance: (req: ServerRequest, res: Response) => Promise<Response>;
  topUpUserBalance: (req: ServerRequest, res: Response) => Promise<Response>;
  listBalances: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const {
    findBalanceByUser,
    updateBalance,
    listBalances,
    findUser,
    recordAuditEntry,
    auditFailClosed,
  } = deps;

  async function emitAudit(args: {
    req: ServerRequest;
    targetUserId: string;
    credits: number;
    tokenCredits: number;
    reason?: string;
  }): Promise<void> {
    if (!recordAuditEntry) return;
    const user = args.req.user;
    const actorId = user?._id?.toString() ?? user?.id;
    const input: RecordAuditEntryInput = {
      action: 'balance.topped_up',
      outcome: 'success',
      severity: 'warning',
      actor: {
        type: 'user',
        id: actorId,
        name: user?.name || user?.username || user?.email || actorId || 'unknown',
      },
      target: { type: 'user', id: args.targetUserId, name: args.targetUserId },
      metadata: {
        credits: args.credits,
        tokenCredits: args.tokenCredits,
        ...(args.reason ? { reason: args.reason } : {}),
      },
      context: buildAuditContext(args.req),
      tenantId: user?.tenantId,
    };
    if (auditFailClosed) {
      /** Let the failure propagate to the handler (→ 5xx); see `auditFailClosed`. */
      await recordAuditEntry(input, { failClosed: true });
      return;
    }
    try {
      await recordAuditEntry(input);
    } catch (error) {
      /** Fail-open: audit failure must not roll back a committed balance change. */
      logger.error('[adminBalance] audit write failed', error);
    }
  }

  /**
   * Admin balance routes address an arbitrary user id, so the caller's tenant must be
   * re-checked here — neither `findBalanceByUser` nor `updateBalance` is tenant-scoped.
   * A mismatch answers 404 rather than 403 so existence does not leak across tenants.
   */
  async function isOutsideCallerTenant(req: ServerRequest, userId: string): Promise<boolean> {
    const target = await findUser({ _id: userId }, 'tenantId');
    if (!target) {
      return true;
    }
    return (target.tenantId ?? undefined) !== (req.user?.tenantId ?? undefined);
  }

  async function getUserBalanceHandler(req: ServerRequest, res: Response) {
    try {
      const { userId } = req.params as { userId: string };
      if (!isValidObjectIdString(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      if (await isOutsideCallerTenant(req, userId)) {
        return res.status(404).json({ error: 'Balance record not found' });
      }

      const balance = await findBalanceByUser(userId);
      if (!balance) {
        return res.status(404).json({ error: 'Balance record not found' });
      }

      return res.status(200).json({ balance: toAdminBalance(userId, balance) });
    } catch (error) {
      logger.error('[adminBalance] getUserBalance error:', error);
      return res.status(500).json({ error: 'Failed to read balance' });
    }
  }

  async function topUpUserBalanceHandler(req: ServerRequest, res: Response) {
    try {
      const { userId } = req.params as { userId: string };
      if (!isValidObjectIdString(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      const { credits, reason } = (req.body ?? {}) as TopUpRequestBody;
      if (typeof credits !== 'number' || !Number.isFinite(credits)) {
        return res.status(400).json({ error: 'Field "credits" must be a finite number' });
      }
      if (credits === 0) {
        return res.status(400).json({ error: 'Field "credits" must not be zero' });
      }
      if (reason != null && typeof reason !== 'string') {
        return res.status(400).json({ error: 'Field "reason" must be a string' });
      }

      if (await isOutsideCallerTenant(req, userId)) {
        return res.status(404).json({ error: 'User not found' });
      }

      const trimmedReason = reason?.trim().slice(0, MAX_REASON_LENGTH) || undefined;
      const balance = await updateBalance({ user: userId, incrementValue: credits });
      const applied = toAdminBalance(userId, balance);

      await emitAudit({
        req,
        targetUserId: userId,
        credits,
        tokenCredits: applied.tokenCredits,
        reason: trimmedReason,
      });

      return res.status(200).json({ balance: applied, credits });
    } catch (error) {
      logger.error('[adminBalance] topUpUserBalance error:', error);
      return res.status(500).json({ error: 'Failed to update balance' });
    }
  }

  async function listBalancesHandler(req: ServerRequest, res: Response) {
    try {
      const { limit, offset } = parsePagination(req.query);
      const { balances, total } = await listBalances({
        limit,
        offset,
        tenantId: req.user?.tenantId,
      });
      return res.status(200).json({ balances, total, limit, offset });
    } catch (error) {
      logger.error('[adminBalance] listBalances error:', error);
      return res.status(500).json({ error: 'Failed to list balances' });
    }
  }

  return {
    getUserBalance: getUserBalanceHandler,
    topUpUserBalance: topUpUserBalanceHandler,
    listBalances: listBalancesHandler,
  };
}
