import { logger } from '@librechat/data-schemas';
import { isBalanceRefillDue } from 'librechat-data-provider';
import type {
  IBalanceUpdate,
  BalanceConfig,
  AppConfig,
  ObjectId,
  IBalance,
  IUser,
} from '@librechat/data-schemas';
import type { NextFunction, Request as ServerRequest, Response as ServerResponse } from 'express';
import type { BalanceUpdateFields } from '~/types';
import { getBalanceConfig } from '~/app/config';

export interface BalanceMiddlewareOptions {
  getAppConfig: (options?: {
    role?: string;
    userId?: string;
    tenantId?: string;
    refresh?: boolean;
  }) => Promise<AppConfig>;
  findBalanceByUser: (
    userId: string,
    options?: { applyReset?: boolean },
  ) => Promise<IBalance | null>;
  upsertBalanceFields: (
    userId: string,
    fields: IBalanceUpdate,
    insertOnly?: IBalanceUpdate,
  ) => Promise<IBalance | null>;
}

type BalanceLocals = {
  balanceData?: IBalance | null;
  balanceConfigEnabled?: boolean;
  /** Admin-assigned credit allotment (`startBalance`); personal spend caps cannot exceed this */
  assignedCreditLimit?: number;
};

const balanceUpdateLocks = new Map<string, Promise<void>>();

async function runBalanceUpdate(userId: string, task: () => Promise<void>): Promise<void> {
  const previous = balanceUpdateLocks.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  const tail = current.then(
    () => undefined,
    () => undefined,
  );

  balanceUpdateLocks.set(userId, tail);

  try {
    await current;
  } finally {
    if (balanceUpdateLocks.get(userId) === tail) {
      balanceUpdateLocks.delete(userId);
    }
  }
}

/**
 * Build an object containing fields that need updating
 * @param config - The balance configuration
 * @param userRecord - The user's current balance record, if any
 * @param userId - The user's ID
 * @returns Fields that need updating
 */
export function buildBalanceUpdateFields(
  config: BalanceConfig,
  userRecord: IBalance | null,
  userId: string,
): BalanceUpdateFields {
  const updateFields: BalanceUpdateFields = {};

  // Ensure user record has the required fields
  if (!userRecord) {
    updateFields.user = userId;
    updateFields.tokenCredits = config.startBalance;
  }

  if (userRecord?.tokenCredits == null && config.startBalance != null) {
    updateFields.tokenCredits = config.startBalance;
  }

  const isAutoRefillConfigValid =
    config.autoRefillEnabled &&
    config.refillIntervalValue != null &&
    config.refillIntervalUnit != null &&
    config.refillAmount != null &&
    (config.refillMode !== 'reset' ||
      (Number.isInteger(config.refillIntervalValue) && config.refillIntervalValue > 0));

  if (!isAutoRefillConfigValid) {
    if (userRecord?.autoRefillEnabled === true) {
      updateFields.autoRefillEnabled = false;
    }
    return updateFields;
  }

  if (userRecord?.autoRefillEnabled !== config.autoRefillEnabled) {
    updateFields.autoRefillEnabled = config.autoRefillEnabled;
  }

  if (userRecord?.refillIntervalValue !== config.refillIntervalValue) {
    updateFields.refillIntervalValue = config.refillIntervalValue;
  }

  if (userRecord?.refillIntervalUnit !== config.refillIntervalUnit) {
    updateFields.refillIntervalUnit = config.refillIntervalUnit;
  }

  const refillMode = config.refillMode ?? 'add';
  if ((userRecord?.refillMode ?? 'add') !== refillMode) {
    updateFields.refillMode = refillMode;
  }

  if (userRecord?.refillAmount !== config.refillAmount) {
    updateFields.refillAmount = config.refillAmount;
  }

  // Initialize lastRefill if it's missing when auto-refill is enabled
  if (config.autoRefillEnabled && !userRecord?.lastRefill) {
    updateFields.lastRefill = new Date();
  }

  return updateFields;
}

/**
 * Factory function to create middleware that synchronizes user balance settings with current balance configuration.
 * @param options - Options containing getBalanceConfig function and Balance model
 * @returns Express middleware function
 */
export function createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
}: BalanceMiddlewareOptions): (
  req: ServerRequest,
  res: ServerResponse,
  next: NextFunction,
) => Promise<void> {
  return async (req: ServerRequest, res: ServerResponse, next: NextFunction): Promise<void> => {
    try {
      const balanceLocals = res.locals as BalanceLocals;
      const user = req.user as IUser & { _id: string | ObjectId };
      const appConfig = await getAppConfig({
        role: user?.role,
        userId: user?.id,
        tenantId: user?.tenantId,
      });
      const balanceConfig = getBalanceConfig(appConfig);
      balanceLocals.balanceConfigEnabled = balanceConfig?.enabled === true;
      if (!balanceConfig?.enabled) {
        return next();
      }
      if (balanceConfig.startBalance == null) {
        return next();
      }
      balanceLocals.assignedCreditLimit = balanceConfig.startBalance;

      if (!user || !user._id) {
        return next();
      }
      const userId = typeof user._id === 'string' ? user._id : user._id.toString();
      await runBalanceUpdate(userId, async () => {
        const userBalanceRecord = await findBalanceByUser(userId, { applyReset: false });
        const updateFields = buildBalanceUpdateFields(balanceConfig, userBalanceRecord, userId);

        if (Object.keys(updateFields).length === 0) {
          balanceLocals.balanceData =
            balanceConfig.autoRefillEnabled === true &&
            userBalanceRecord?.refillMode === 'reset' &&
            isBalanceRefillDue(userBalanceRecord, new Date())
              ? await findBalanceByUser(userId)
              : userBalanceRecord;
          return;
        }

        if (userBalanceRecord == null) {
          const { tokenCredits, ...syncFields } = updateFields;
          balanceLocals.balanceData = await upsertBalanceFields(userId, syncFields, {
            tokenCredits,
          });
          return;
        }

        balanceLocals.balanceData = await upsertBalanceFields(userId, updateFields);
      });

      next();
    } catch (error) {
      logger.error('Error setting user balance:', error);
      next(error);
    }
  };
}

export type PersonalSpendLimitBody = {
  personalSpendEnabled?: boolean;
  personalSpendLimit?: number | null;
};

export type UpdatePersonalSpendLimitDeps = {
  upsertBalanceFields: (
    userId: string,
    fields: IBalanceUpdate,
    insertOnly?: IBalanceUpdate,
  ) => Promise<IBalance | null>;
  findBalanceByUser: (userId: string) => Promise<IBalance | null>;
};

function isValidPersonalLimit(value: unknown): value is number | null {
  if (value === null) {
    return true;
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Admin-assigned credit allotment the personal cap may not exceed.
 * Prefers `startBalance` from config; falls back to the user's current credits.
 */
export function resolveAssignedCreditLimit(params: {
  assignedCreditLimit?: number;
  tokenCredits?: number | null;
}): number | null {
  const assigned = params.assignedCreditLimit;
  if (typeof assigned === 'number' && Number.isFinite(assigned) && assigned >= 0) {
    return assigned;
  }
  const credits = params.tokenCredits;
  if (typeof credits === 'number' && Number.isFinite(credits) && credits >= 0) {
    return credits;
  }
  return null;
}

function toPublicBalance(updated: IBalance): Record<string, unknown> {
  const { _id: _, ...rest } = updated;
  const result: Record<string, unknown> = { ...rest };
  if (!updated.autoRefillEnabled) {
    delete result.refillIntervalValue;
    delete result.refillIntervalUnit;
    delete result.lastRefill;
    delete result.refillAmount;
  }
  return result;
}

/**
 * Validates and persists the user's personal spend toggle and/or limit for the current balance.
 * A positive limit may not exceed the admin-assigned credit allotment.
 */
export function createUpdatePersonalSpendLimit({
  upsertBalanceFields,
  findBalanceByUser,
}: UpdatePersonalSpendLimitDeps) {
  return async (req: ServerRequest, res: ServerResponse, next: NextFunction): Promise<void> => {
    try {
      const balanceLocals = res.locals as BalanceLocals;
      if (balanceLocals.balanceConfigEnabled === false) {
        res.sendStatus(204);
        return;
      }

      const userId = req.user?.id ?? req.user?._id?.toString();
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const body = (req.body ?? {}) as PersonalSpendLimitBody;
      const fields: IBalanceUpdate = {};

      if (Object.prototype.hasOwnProperty.call(body, 'personalSpendEnabled')) {
        if (typeof body.personalSpendEnabled !== 'boolean') {
          res.status(400).json({ error: 'personalSpendEnabled must be a boolean' });
          return;
        }
        fields.personalSpendEnabled = body.personalSpendEnabled;
      }

      if (Object.prototype.hasOwnProperty.call(body, 'personalSpendLimit')) {
        if (!isValidPersonalLimit(body.personalSpendLimit)) {
          res
            .status(400)
            .json({ error: 'personalSpendLimit must be null or a non-negative number' });
          return;
        }

        if (body.personalSpendLimit != null) {
          const current = balanceLocals.balanceData ?? (await findBalanceByUser(userId));
          const assigned = resolveAssignedCreditLimit({
            assignedCreditLimit: balanceLocals.assignedCreditLimit,
            tokenCredits: current?.tokenCredits,
          });
          if (assigned == null) {
            res.status(400).json({ error: 'Assigned credit limit is unavailable' });
            return;
          }
          if (body.personalSpendLimit > assigned) {
            res.status(400).json({
              error: 'personalSpendLimit cannot exceed the assigned credit limit',
              assignedCreditLimit: assigned,
            });
            return;
          }
        }

        fields.personalSpendLimit = body.personalSpendLimit;
      }

      if (Object.keys(fields).length === 0) {
        res.status(400).json({
          error: 'Provide personalSpendEnabled and/or personalSpendLimit',
        });
        return;
      }

      const updated = await upsertBalanceFields(userId, fields);
      if (!updated) {
        res.status(404).json({ error: 'Balance not found' });
        return;
      }

      res.status(200).json(toPublicBalance(updated));
    } catch (error) {
      next(error);
    }
  };
}
