import { Types } from 'mongoose';
import type { Model } from 'mongoose';
import type { IBalance } from '~/types';
import { buExpression } from './transaction';

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

export function createBudgetMethods(mongoose: typeof import('mongoose')) {
  /**
   * Returns one row per user who either has a Balance record or has consumed this month
   * (outer join Users ⟕ Balance ⟕ current-month spend). Spend is derived live from
   * transactions; budgets fall back to the schema default when no Balance exists yet.
   * Sorted by descending month-to-date spend.
   */
  async function getAllBudgets(): Promise<AdminBudgetRow[]> {
    const User = mongoose.models.User;
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

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
        $match: {
          $expr: {
            $or: [
              { $ne: [{ $ifNull: ['$balanceDoc', null] }, null] },
              { $gt: [{ $ifNull: ['$spendDoc.spend', 0] }, 0] },
            ],
          },
        },
      },
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
      { $sort: { currentMonthSpend: -1 } },
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

  return { getAllBudgets, updateBudget, resetMonthBudgets };
}

export type BudgetMethods = ReturnType<typeof createBudgetMethods>;
