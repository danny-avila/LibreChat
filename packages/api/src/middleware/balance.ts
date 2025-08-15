import { logger } from '@librechat/data-schemas';
import type { NextFunction, Request as ServerRequest, Response as ServerResponse } from 'express';
import type { IBalance, IUser, BalanceConfig, ObjectId } from '@librechat/data-schemas';
import type { Model } from 'mongoose';
import type { BalanceUpdateFields } from '~/types';

export interface BalanceMiddlewareOptions {
  getBalanceConfig: () => Promise<BalanceConfig | null>;
  Balance: Model<IBalance>;
}

/**
 * Build an object containing fields that need updating
 * @param config - The balance configuration
 * @param userRecord - The user's current balance record, if any
 * @param userId - The user's ID
 * @returns Fields that need updating
 */
function buildUpdateFields(
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
    config.refillAmount != null;

  if (!isAutoRefillConfigValid) {
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
  getBalanceConfig,
  Balance,
}: BalanceMiddlewareOptions): (
  req: ServerRequest,
  res: ServerResponse,
  next: NextFunction,
) => Promise<void> {
  return async (req: ServerRequest, res: ServerResponse, next: NextFunction): Promise<void> => {
    try {
      const balanceConfig = await getBalanceConfig();
      if (!balanceConfig?.enabled) {
        return next();
      }
      if (balanceConfig.startBalance == null) {
        return next();
      }

      const user = req.user as IUser & { _id: string | ObjectId };
      if (!user || !user._id) {
        return next();
      }
      const userId = typeof user._id === 'string' ? user._id : user._id.toString();
      const userBalanceRecord = await Balance.findOne({ user: userId }).lean();
      const updateFields = buildUpdateFields(balanceConfig, userBalanceRecord, userId);

      if (Object.keys(updateFields).length === 0) {
        return next();
      }

      await Balance.findOneAndUpdate(
        { user: userId },
        { $set: updateFields },
        { upsert: true, new: true },
      );

      next();
    } catch (error) {
      logger.error('Error setting user balance:', error);
      next(error);
    }
  };
}
