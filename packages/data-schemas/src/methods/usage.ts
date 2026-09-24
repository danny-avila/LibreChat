import { USAGE_MAX_ROWS, USAGE_MAX_USERS } from 'librechat-data-provider';
import type {
  TAdminBalanceListItem,
  RefillIntervalUnit,
  TUsageMonthlyRow,
  TUsageModelTotal,
  TUsageMonthTotal,
  TUsageUserTotal,
  TUsageRoleTotal,
  TUsageTotals,
} from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { ITransaction } from '~/schema/transaction';
import type { IBalance } from '~/types';
import { validTimeZone, tenantMatch } from './insights';

/** Ledger rows written by balance grants and auto-refills, excluded from model usage. */
const USAGE_TOKEN_TYPES = ['prompt', 'completion'];

const UNKNOWN_MODEL = 'unknown';

export type MonthlyUsageOptions = {
  from: Date;
  to: Date;
  timeZone?: string;
  tenantId?: string;
  userId?: string;
  /** Highest-spend rows kept; defaults to `USAGE_MAX_ROWS`. */
  limit?: number;
};

export type MonthlyUsageResult = {
  rows: TUsageMonthlyRow[];
  /** More rows matched than `limit` allowed; the returned ones are the biggest spenders. */
  capped: boolean;
};

export type UsageTotalsOptions = {
  from: Date;
  to: Date;
  timeZone?: string;
  tenantId?: string;
  userId?: string;
  /** Highest-spend users kept by the `byUser` branch; defaults to `USAGE_MAX_USERS`. */
  userLimit?: number;
};

export type ListBalancesOptions = {
  limit: number;
  offset: number;
  tenantId?: string;
};

export type ListBalancesResult = {
  balances: TAdminBalanceListItem[];
  total: number;
};

export type UsageMethods = {
  getMonthlyUsage: (options: MonthlyUsageOptions) => Promise<MonthlyUsageResult>;
  getUsageTotals: (options: UsageTotalsOptions) => Promise<TUsageTotals>;
  listBalances: (options: ListBalancesOptions) => Promise<ListBalancesResult>;
};

type UsageIdentity = {
  name?: string;
  username?: string;
  email?: string;
  role?: string;
};

type UsageAmounts = {
  credits: number;
  tokens: number;
  transactions: number;
};

type MonthlyUsageRow = UsageAmounts & {
  userId: string;
  model?: string;
  month: string;
  identity?: UsageIdentity;
};

type UsageModelRow = UsageAmounts & { model?: string };
type UsageMonthRow = UsageAmounts & { month: string };
type UsageRoleRow = UsageAmounts & { role?: string; users: number };
type UsageUserRow = UsageAmounts & { userId: string; identity?: UsageIdentity };

/** One `$facet` answer: a single document holding every rollup branch. */
type UsageTotalsFacet = {
  overall: UsageAmounts[];
  byModel: UsageModelRow[];
  byMonth: UsageMonthRow[];
  byRole: UsageRoleRow[];
  byUser: UsageUserRow[];
};

type BalanceRow = {
  userId: string;
  tokenCredits?: number;
  autoRefillEnabled?: boolean;
  refillIntervalValue?: number;
  refillIntervalUnit?: RefillIntervalUnit;
  refillAmount?: number;
  lastRefill?: Date;
  identity?: UsageIdentity & { role?: string };
};

const displayName = (identity?: UsageIdentity) => identity?.name || identity?.username || '';

/** Spend is stored as a negative ledger delta; usage reports read it as a magnitude. */
const spendMagnitude = (field: string) => ({ $abs: { $ifNull: [field, 0] } });

const creditSums = {
  credits: { $sum: spendMagnitude('$tokenValue') },
  tokens: { $sum: spendMagnitude('$rawAmount') },
  transactions: { $sum: 1 },
};

/** Re-sums already-bucketed amounts, so a rollup never rescans the raw ledger. */
const rollupSums = {
  credits: { $sum: '$credits' },
  tokens: { $sum: '$tokens' },
  transactions: { $sum: '$transactions' },
};

const emptyAmounts = (): UsageAmounts => ({ credits: 0, tokens: 0, transactions: 0 });

/** Flattens a `$lookup` array into the four identity fields every admin table reads. */
const identityFrom = (lookupField: string) => ({
  $let: {
    vars: { matched: { $arrayElemAt: [lookupField, 0] } },
    in: {
      name: '$$matched.name',
      username: '$$matched.username',
      email: '$$matched.email',
      role: '$$matched.role',
    },
  },
});

export function createUsageMethods(mongoose: typeof import('mongoose')): UsageMethods {
  function transactionMatch(options: UsageTotalsOptions) {
    const base = {
      ...tenantMatch(options.tenantId),
      tokenType: { $in: USAGE_TOKEN_TYPES },
      createdAt: { $gte: options.from, $lte: options.to },
    };
    if (!options.userId) {
      return base;
    }
    return { ...base, user: new mongoose.Types.ObjectId(options.userId) };
  }

  /**
   * Single-pass `{ user, model, month }` rollup, highest spend first. The cap is applied
   * before the `$lookup` so a wide range joins identities only for the rows it returns,
   * and one extra row is read to tell "exactly at the cap" from "truncated".
   */
  async function getMonthlyUsage(options: MonthlyUsageOptions): Promise<MonthlyUsageResult> {
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const timeZone = validTimeZone(options.timeZone);
    const limit = options.limit && options.limit > 0 ? options.limit : USAGE_MAX_ROWS;

    const rows = await Transaction.aggregate<MonthlyUsageRow>([
      { $match: transactionMatch(options) },
      {
        $group: {
          _id: {
            user: '$user',
            model: '$model',
            month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: timeZone } },
          },
          ...creditSums,
        },
      },
      { $sort: { credits: -1, '_id.month': -1, '_id.user': 1, '_id.model': 1 } },
      { $limit: limit + 1 },
      {
        $lookup: {
          from: 'users',
          localField: '_id.user',
          foreignField: '_id',
          as: 'usageIdentity',
        },
      },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$_id.user' },
          model: '$_id.model',
          month: '$_id.month',
          credits: 1,
          tokens: 1,
          transactions: 1,
          identity: identityFrom('$usageIdentity'),
        },
      },
    ]);

    const capped = rows.length > limit;
    const kept = capped ? rows.slice(0, limit) : rows;

    return {
      capped,
      rows: kept.map((row) => ({
        userId: row.userId,
        name: displayName(row.identity),
        email: row.identity?.email ?? '',
        role: row.identity?.role ?? '',
        model: row.model ?? UNKNOWN_MODEL,
        month: row.month,
        credits: row.credits,
        tokens: row.tokens,
        transactions: row.transactions,
      })),
    };
  }

  /**
   * Overall spend with its per-model, per-month, per-role and per-user breakdowns. The ledger
   * is reduced to `{ user, model, month }` buckets once, then `$facet` re-sums that compact
   * stream five ways, so no rollup rescans transactions and none of it lands in the browser.
   * The role and user branches group by user before their `$lookup`, giving one user read per
   * spender regardless of how many models or months that spender touched; `byUser` caps after
   * its sort, so the join covers only the spenders it returns and every figure it carries is a
   * whole-range total rather than a sum of whichever detail rows survived `USAGE_MAX_ROWS`.
   */
  async function getUsageTotals(options: UsageTotalsOptions): Promise<TUsageTotals> {
    const Transaction = mongoose.models.Transaction as Model<ITransaction>;
    const timeZone = validTimeZone(options.timeZone);
    const userLimit =
      options.userLimit && options.userLimit > 0 ? options.userLimit : USAGE_MAX_USERS;

    const [facet] = await Transaction.aggregate<UsageTotalsFacet>([
      { $match: transactionMatch(options) },
      {
        $group: {
          _id: {
            user: '$user',
            model: '$model',
            month: { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: timeZone } },
          },
          ...creditSums,
        },
      },
      {
        $facet: {
          overall: [
            { $group: { _id: null, ...rollupSums } },
            { $project: { _id: 0, credits: 1, tokens: 1, transactions: 1 } },
          ],
          byModel: [
            { $group: { _id: '$_id.model', ...rollupSums } },
            { $sort: { credits: -1, _id: 1 } },
            { $project: { _id: 0, model: '$_id', credits: 1, tokens: 1, transactions: 1 } },
          ],
          byMonth: [
            { $group: { _id: '$_id.month', ...rollupSums } },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, month: '$_id', credits: 1, tokens: 1, transactions: 1 } },
          ],
          byRole: [
            { $group: { _id: '$_id.user', ...rollupSums } },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'roleIdentity',
              },
            },
            {
              $group: {
                _id: { $arrayElemAt: ['$roleIdentity.role', 0] },
                ...rollupSums,
                users: { $sum: 1 },
              },
            },
            { $sort: { credits: -1, _id: 1 } },
            {
              $project: {
                _id: 0,
                role: '$_id',
                credits: 1,
                tokens: 1,
                transactions: 1,
                users: 1,
              },
            },
          ],
          byUser: [
            { $group: { _id: '$_id.user', ...rollupSums } },
            { $sort: { credits: -1, _id: 1 } },
            { $limit: userLimit },
            {
              $lookup: {
                from: 'users',
                localField: '_id',
                foreignField: '_id',
                as: 'spenderIdentity',
              },
            },
            {
              $project: {
                _id: 0,
                userId: { $toString: '$_id' },
                credits: 1,
                tokens: 1,
                transactions: 1,
                identity: identityFrom('$spenderIdentity'),
              },
            },
          ],
        },
      },
    ]);

    const overall = facet?.overall?.[0] ?? emptyAmounts();
    const models: TUsageModelTotal[] = (facet?.byModel ?? []).map((row) => ({
      model: row.model ?? UNKNOWN_MODEL,
      credits: row.credits,
      tokens: row.tokens,
      transactions: row.transactions,
    }));
    const byMonth: TUsageMonthTotal[] = (facet?.byMonth ?? []).map((row) => ({
      month: row.month,
      credits: row.credits,
      tokens: row.tokens,
      transactions: row.transactions,
    }));
    const byRole: TUsageRoleTotal[] = (facet?.byRole ?? []).map((row) => ({
      role: row.role ?? '',
      users: row.users,
      credits: row.credits,
      tokens: row.tokens,
      transactions: row.transactions,
    }));
    const byUser: TUsageUserTotal[] = (facet?.byUser ?? []).map((row) => ({
      userId: row.userId,
      name: displayName(row.identity),
      email: row.identity?.email ?? '',
      role: row.identity?.role ?? '',
      credits: row.credits,
      tokens: row.tokens,
      transactions: row.transactions,
    }));

    return {
      credits: overall.credits,
      tokens: overall.tokens,
      transactions: overall.transactions,
      models,
      byMonth,
      byRole,
      byUser,
    };
  }

  /** Paginated balances joined with their owners in one aggregation. */
  async function listBalances(options: ListBalancesOptions): Promise<ListBalancesResult> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    const match = tenantMatch(options.tenantId);

    const [rows, total] = await Promise.all([
      Balance.aggregate<BalanceRow>([
        { $match: match },
        { $sort: { tokenCredits: -1, _id: 1 } },
        { $skip: options.offset },
        { $limit: options.limit },
        {
          $lookup: {
            from: 'users',
            localField: 'user',
            foreignField: '_id',
            as: 'balanceIdentity',
          },
        },
        {
          $project: {
            _id: 0,
            userId: { $toString: '$user' },
            tokenCredits: 1,
            autoRefillEnabled: 1,
            refillIntervalValue: 1,
            refillIntervalUnit: 1,
            refillAmount: 1,
            lastRefill: 1,
            identity: identityFrom('$balanceIdentity'),
          },
        },
      ]),
      Balance.countDocuments(match),
    ]);

    const balances: TAdminBalanceListItem[] = rows.map((row) => ({
      userId: row.userId,
      name: displayName(row.identity),
      email: row.identity?.email ?? '',
      role: row.identity?.role ?? '',
      tokenCredits: row.tokenCredits ?? 0,
      autoRefillEnabled: row.autoRefillEnabled ?? false,
      refillIntervalValue: row.refillIntervalValue ?? 0,
      refillIntervalUnit: row.refillIntervalUnit ?? 'days',
      refillAmount: row.refillAmount ?? 0,
      lastRefill: row.lastRefill?.toISOString(),
    }));

    return { balances, total };
  }

  return { getMonthlyUsage, getUsageTotals, listBalances };
}
