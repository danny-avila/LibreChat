import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { IBalance } from '~/types';
import { buExpression, currentMonthStartUTC } from './transaction';

/** Default monthly budget, in tokenCredits (1 USD = 1_000_000 tokenCredits) → $10. */
export const DEFAULT_MONTHLY_BUDGET = 10_000_000;

/** One row of the admin budgets view: a user's threshold versus current-month spend. */
export interface AdminBudgetRow {
  user: string;
  name: string | null;
  email: string | null;
  bu: string | null;
  /** Current threshold for the ongoing month, in tokenCredits. */
  monthlyBudget: number;
  /** Reference threshold restored on monthly reset, in tokenCredits. */
  monthlyBudgetBaseline: number;
  /** Month-to-date consumption, in tokenCredits (derived live, never stored). */
  currentMonthSpend: number;
}

/** Editable budget fields on a user's Balance record. */
export interface UpdateBudgetInput {
  monthlyBudget?: number;
  monthlyBudgetBaseline?: number;
}

/** A single user's budget thresholds and current-month spend (all in tokenCredits). */
export interface UserBudget {
  monthlyBudget: number;
  monthlyBudgetBaseline: number;
  currentMonthSpend: number;
}

export function createBudgetMethods(mongoose: typeof import('mongoose')) {
  /**
   * Returns one row per user in the User collection (outer join Users ⟕ Balance ⟕
   * current-month spend), so an admin can set a threshold proactively before a user's
   * first consumption. Spend is derived live from transactions; budgets fall back to the
   * schema default when no Balance exists yet. Sorted by descending month-to-date spend,
   * then name/email/id ascending for a deterministic order between users at $0.
   */
  async function getAllBudgets(): Promise<AdminBudgetRow[]> {
    const User = mongoose.models.User;
    const startOfMonth = currentMonthStartUTC();

    return User.aggregate<AdminBudgetRow>([
      {
        $lookup: {
          from: 'balances',
          localField: '_id',
          foreignField: 'user',
          as: 'balanceDoc',
        },
      },
      { $unwind: { path: '$balanceDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'transactions',
          let: { uid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$user', '$$uid'] },
                    { $gte: ['$createdAt', startOfMonth] },
                    { $in: ['$tokenType', ['prompt', 'completion']] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                spend: { $sum: { $abs: { $ifNull: ['$tokenValue', 0] } } },
              },
            },
          ],
          as: 'spendDoc',
        },
      },
      { $unwind: { path: '$spendDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          user: { $toString: '$_id' },
          name: { $ifNull: ['$name', null] },
          email: { $ifNull: ['$email', null] },
          bu: buExpression('$email', '$tenantId'),
          monthlyBudget: { $ifNull: ['$balanceDoc.monthlyBudget', DEFAULT_MONTHLY_BUDGET] },
          monthlyBudgetBaseline: {
            $ifNull: ['$balanceDoc.monthlyBudgetBaseline', DEFAULT_MONTHLY_BUDGET],
          },
          currentMonthSpend: { $ifNull: ['$spendDoc.spend', 0] },
        },
      },
      { $sort: { currentMonthSpend: -1, name: 1, email: 1, user: 1 } },
    ]);
  }

  /**
   * Updates a user's budget fields, creating the Balance record (with schema defaults)
   * if it does not exist yet. Only the provided fields are written.
   */
  async function updateBudget(
    userId: string,
    fields: UpdateBudgetInput,
  ): Promise<IBalance | null> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    const set: UpdateBudgetInput = {};
    if (typeof fields.monthlyBudget === 'number') {
      set.monthlyBudget = fields.monthlyBudget;
    }
    if (typeof fields.monthlyBudgetBaseline === 'number') {
      set.monthlyBudgetBaseline = fields.monthlyBudgetBaseline;
    }

    const filter = { user: new Types.ObjectId(userId) };
    if (Object.keys(set).length === 0) {
      return Balance.findOne(filter).lean<IBalance>();
    }

    return Balance.findOneAndUpdate(
      filter,
      { $set: set },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean<IBalance>();
  }

  /**
   * Monthly reset: restores every Balance's current budget to its baseline.
   * Returns the number of records modified.
   */
  async function resetMonthBudgets(): Promise<number> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    const result = await Balance.updateMany({}, [
      { $set: { monthlyBudget: { $ifNull: ['$monthlyBudgetBaseline', DEFAULT_MONTHLY_BUDGET] } } },
    ]);
    return result.modifiedCount ?? 0;
  }

  /**
   * Returns a single user's budget thresholds and current-month spend.
   * Thresholds fall back to DEFAULT_MONTHLY_BUDGET when the user has no Balance record;
   * spend is derived live from current-month prompt + completion transactions (0 if none).
   */
  async function getUserBudget(userId: string): Promise<UserBudget> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    const Transaction = mongoose.models.Transaction;
    const objectId = new Types.ObjectId(userId);

    const balance = await Balance.findOne({ user: objectId }).lean<IBalance>();

    const spendResult = await Transaction.aggregate<{ spend: number }>([
      {
        $match: {
          user: objectId,
          createdAt: { $gte: currentMonthStartUTC() },
          tokenType: { $in: ['prompt', 'completion'] },
        },
      },
      {
        $group: {
          _id: null,
          spend: { $sum: { $abs: { $ifNull: ['$tokenValue', 0] } } },
        },
      },
    ]);

    return {
      monthlyBudget: balance?.monthlyBudget ?? DEFAULT_MONTHLY_BUDGET,
      monthlyBudgetBaseline: balance?.monthlyBudgetBaseline ?? DEFAULT_MONTHLY_BUDGET,
      currentMonthSpend: spendResult[0]?.spend ?? 0,
    };
  }

  return { getAllBudgets, updateBudget, resetMonthBudgets, getUserBudget };
}

export type BudgetMethods = ReturnType<typeof createBudgetMethods>;
