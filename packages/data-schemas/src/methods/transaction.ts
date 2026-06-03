import logger from '~/config/winston';
import type { FilterQuery, Model, Types } from 'mongoose';
import type { IBalance, IBalanceUpdate, TransactionData } from '~/types';
import type { ITransaction } from '~/schema/transaction';

const cancelRate = 1.15;

/** Start of the current calendar month, in UTC — single source for the monthly usage window. */
export function currentMonthStartUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** A MongoDB aggregation expression (JSON-like tree of operators, literals and field paths). */
type AggExpr = string | number | boolean | null | RegExp | AggExpr[] | { [key: string]: AggExpr };

/**
 * Aggregation expression deriving a user's Business Unit (single source of truth).
 * An explicit `tenantId` wins; otherwise the email domain maps to POP / BETC / Vermeer;
 * otherwise the raw email domain is used; `null` when there is no email.
 * @param emailPath field path to the user email (e.g. '$userDoc.email')
 * @param tenantIdPath field path to the user tenantId (e.g. '$userDoc.tenantId')
 */
export function buExpression(emailPath: string, tenantIdPath: string): AggExpr {
  return {
    $cond: {
      if: { $ne: [{ $ifNull: [tenantIdPath, null] }, null] },
      then: tenantIdPath,
      else: {
        $switch: {
          branches: [
            {
              case: { $regexMatch: { input: { $ifNull: [emailPath, ''] }, regex: /@proseonpixels\.com$/i } },
              then: 'POP',
            },
            {
              case: { $regexMatch: { input: { $ifNull: [emailPath, ''] }, regex: /@betc\.com$/i } },
              then: 'BETC',
            },
            {
              case: { $regexMatch: { input: { $ifNull: [emailPath, ''] }, regex: /@vermeer\.cloud$/i } },
              then: 'Vermeer',
            },
          ],
          default: {
            $cond: {
              if: { $or: [{ $eq: [emailPath, null] }, { $not: [emailPath] }] },
              then: null,
              else: { $arrayElemAt: [{ $split: [emailPath, '@'] }, 1] },
            },
          },
        },
      },
    },
  };
}

/** BU filter values, matching the client-side BUFilter ('all' = no filtering). */
export type BuFilter = 'all' | 'POP' | 'BETC' | 'Other';

/** Optional window + BU filter for the admin usage aggregations. */
export interface UsageQueryParams {
  /** Inclusive lower bound on createdAt (UTC). Defaults to the current month start. */
  start?: Date;
  /** Exclusive upper bound on createdAt (UTC). Defaults to now. */
  end?: Date;
  /** Restrict to a business unit. Omitted or 'all' = no BU filter. */
  bu?: BuFilter;
}

/** One month with recorded activity, for the period selector. `label` is ISO "YYYY-MM". */
export interface AvailablePeriod {
  year: number;
  month: number;
  label: string;
}

/**
 * Resolves a BU filter to the value produced by buExpression:
 * 'POP'/'BETC' match directly, 'Other' maps to null, and 'all'/undefined means no filter.
 */
function buFilterValue(bu?: BuFilter): string | null | undefined {
  if (!bu || bu === 'all') {
    return undefined;
  }
  if (bu === 'Other') {
    return null;
  }
  return bu;
}

type MultiplierParams = {
  model?: string;
  valueKey?: string;
  tokenType?: 'prompt' | 'completion';
  inputTokenCount?: number;
  endpointTokenConfig?: Record<string, Record<string, number>>;
};

type CacheMultiplierParams = {
  cacheType?: 'write' | 'read';
  model?: string;
  endpointTokenConfig?: Record<string, Record<string, number>>;
};

/** Fields read/written by the internal token value calculators */
interface InternalTxDoc {
  valueKey?: string;
  tokenType?: 'prompt' | 'completion' | 'credits';
  model?: string;
  endpointTokenConfig?: Record<string, Record<string, number>> | null;
  inputTokenCount?: number;
  rawAmount?: number;
  context?: string;
  rate?: number;
  tokenValue?: number;
  rateDetail?: Record<string, number>;
  inputTokens?: number;
  writeTokens?: number;
  readTokens?: number;
}

/** Input data for creating a transaction */
export interface TxData {
  user: string | Types.ObjectId;
  conversationId?: string;
  model?: string;
  context?: string;
  tokenType?: 'prompt' | 'completion' | 'credits';
  rawAmount?: number;
  valueKey?: string;
  endpointTokenConfig?: Record<string, Record<string, number>> | null;
  inputTokenCount?: number;
  inputTokens?: number;
  writeTokens?: number;
  readTokens?: number;
  balance?: { enabled?: boolean };
  transactions?: { enabled?: boolean };
}

/** Return value from a successful transaction that also updates the balance */
export interface TransactionResult {
  rate: number;
  user: string;
  balance: number;
  prompt?: number;
  completion?: number;
  credits?: number;
}

export function createTransactionMethods(
  mongoose: typeof import('mongoose'),
  txMethods: {
    getMultiplier: (params: MultiplierParams) => number;
    getCacheMultiplier: (params: CacheMultiplierParams) => number | null;
  },
) {
  /** Calculate and set the tokenValue for a transaction */
  function calculateTokenValue(txn: InternalTxDoc) {
    const { valueKey, tokenType, model, endpointTokenConfig, inputTokenCount } = txn;
    const multiplier = Math.abs(
      txMethods.getMultiplier({
        valueKey,
        tokenType: tokenType as 'prompt' | 'completion' | undefined,
        model,
        endpointTokenConfig: endpointTokenConfig ?? undefined,
        inputTokenCount,
      }),
    );
    txn.rate = multiplier;
    txn.tokenValue = (txn.rawAmount ?? 0) * multiplier;
    if (txn.context && txn.tokenType === 'completion' && txn.context === 'incomplete') {
      txn.tokenValue = Math.ceil((txn.tokenValue ?? 0) * cancelRate);
      txn.rate = (txn.rate ?? 0) * cancelRate;
    }
  }

  /** Calculate token value for structured tokens */
  function calculateStructuredTokenValue(txn: InternalTxDoc) {
    if (!txn.tokenType) {
      txn.tokenValue = txn.rawAmount;
      return;
    }

    const { model, endpointTokenConfig, inputTokenCount } = txn;
    const etConfig = endpointTokenConfig ?? undefined;

    if (txn.tokenType === 'prompt') {
      const inputMultiplier = txMethods.getMultiplier({
        tokenType: 'prompt',
        model,
        endpointTokenConfig: etConfig,
        inputTokenCount,
      });
      const writeMultiplier =
        txMethods.getCacheMultiplier({
          cacheType: 'write',
          model,
          endpointTokenConfig: etConfig,
        }) ?? inputMultiplier;
      const readMultiplier =
        txMethods.getCacheMultiplier({ cacheType: 'read', model, endpointTokenConfig: etConfig }) ??
        inputMultiplier;

      txn.rateDetail = {
        input: inputMultiplier,
        write: writeMultiplier,
        read: readMultiplier,
      };

      const totalPromptTokens =
        Math.abs(txn.inputTokens ?? 0) +
        Math.abs(txn.writeTokens ?? 0) +
        Math.abs(txn.readTokens ?? 0);

      if (totalPromptTokens > 0) {
        txn.rate =
          (Math.abs(inputMultiplier * (txn.inputTokens ?? 0)) +
            Math.abs(writeMultiplier * (txn.writeTokens ?? 0)) +
            Math.abs(readMultiplier * (txn.readTokens ?? 0))) /
          totalPromptTokens;
      } else {
        txn.rate = Math.abs(inputMultiplier);
      }

      txn.tokenValue = -(
        Math.abs(txn.inputTokens ?? 0) * inputMultiplier +
        Math.abs(txn.writeTokens ?? 0) * writeMultiplier +
        Math.abs(txn.readTokens ?? 0) * readMultiplier
      );

      txn.rawAmount = -totalPromptTokens;
    } else if (txn.tokenType === 'completion') {
      const multiplier = txMethods.getMultiplier({
        tokenType: txn.tokenType,
        model,
        endpointTokenConfig: etConfig,
        inputTokenCount,
      });
      txn.rate = Math.abs(multiplier);
      txn.tokenValue = -Math.abs(txn.rawAmount ?? 0) * multiplier;
      txn.rawAmount = -Math.abs(txn.rawAmount ?? 0);
    }

    if (txn.context && txn.tokenType === 'completion' && txn.context === 'incomplete') {
      txn.tokenValue = Math.ceil((txn.tokenValue ?? 0) * cancelRate);
      txn.rate = (txn.rate ?? 0) * cancelRate;
      if (txn.rateDetail) {
        txn.rateDetail = Object.fromEntries(
          Object.entries(txn.rateDetail).map(([k, v]) => [k, v * cancelRate]),
        );
      }
    }
  }

  /**
   * Updates a user's token balance using optimistic concurrency control.
   * Always returns an IBalance or throws after exhausting retries.
   */
  async function updateBalance({
    user,
    incrementValue,
    setValues,
  }: {
    user: string;
    incrementValue: number;
    setValues?: IBalanceUpdate;
  }): Promise<IBalance> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    const maxRetries = 10;
    let delay = 50;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let currentBalanceDoc;
      try {
        currentBalanceDoc = await Balance.findOne({ user }).lean();
        const currentCredits = currentBalanceDoc ? currentBalanceDoc.tokenCredits : 0;
        const potentialNewCredits = currentCredits + incrementValue;
        const newCredits = Math.max(0, potentialNewCredits);

        const updatePayload = {
          $set: {
            tokenCredits: newCredits,
            ...(setValues ?? {}),
          },
        };

        let updatedBalance: IBalance | null = null;
        if (currentBalanceDoc) {
          updatedBalance = await Balance.findOneAndUpdate(
            { user, tokenCredits: currentCredits },
            updatePayload,
            { new: true },
          ).lean();

          if (updatedBalance) {
            return updatedBalance;
          }
          lastError = new Error(`Concurrency conflict for user ${user} on attempt ${attempt}.`);
        } else {
          try {
            updatedBalance = await Balance.findOneAndUpdate({ user }, updatePayload, {
              upsert: true,
              new: true,
            }).lean();

            if (updatedBalance) {
              return updatedBalance;
            }
            lastError = new Error(
              `Upsert race condition suspected for user ${user} on attempt ${attempt}.`,
            );
          } catch (error: unknown) {
            if (
              error instanceof Error &&
              'code' in error &&
              (error as { code: number }).code === 11000
            ) {
              lastError = error;
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        logger.error(`[updateBalance] Error during attempt ${attempt} for user ${user}:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < maxRetries) {
        const jitter = Math.random() * delay * 0.5;
        await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        delay = Math.min(delay * 2, 2000);
      }
    }

    logger.error(
      `[updateBalance] Failed to update balance for user ${user} after ${maxRetries} attempts.`,
    );
    throw (
      lastError ??
      new Error(
        `Failed to update balance for user ${user} after maximum retries due to persistent conflicts.`,
      )
    );
  }

  /**
   * Creates an auto-refill transaction that also updates balance.
   */
  async function createAutoRefillTransaction(txData: TxData) {
    if (txData.rawAmount != null && isNaN(txData.rawAmount)) {
      return;
    }
    const Transaction = mongoose.models.Transaction;
    const transaction = new Transaction(txData);
    transaction.endpointTokenConfig = txData.endpointTokenConfig;
    transaction.inputTokenCount = txData.inputTokenCount;
    calculateTokenValue(transaction);
    await transaction.save();

    const balanceResponse = await updateBalance({
      user: transaction.user as string,
      incrementValue: txData.rawAmount ?? 0,
      setValues: { lastRefill: new Date() },
    });
    const result = {
      rate: transaction.rate as number,
      user: transaction.user.toString() as string,
      balance: balanceResponse.tokenCredits,
      transaction,
    };
    logger.debug('[Balance.check] Auto-refill performed', result);
    return result;
  }

  /**
   * Creates a transaction and updates the balance.
   */
  async function createTransaction(_txData: TxData): Promise<TransactionResult | undefined> {
    const { balance, transactions, ...txData } = _txData;
    if (txData.rawAmount != null && isNaN(txData.rawAmount)) {
      return;
    }

    if (transactions?.enabled === false) {
      return;
    }

    const Transaction = mongoose.models.Transaction;
    const transaction = new Transaction(txData);
    transaction.endpointTokenConfig = txData.endpointTokenConfig;
    transaction.inputTokenCount = txData.inputTokenCount;
    calculateTokenValue(transaction);

    await transaction.save();
    if (!balance?.enabled) {
      return;
    }

    const incrementValue = transaction.tokenValue as number;
    const balanceResponse = await updateBalance({
      user: transaction.user as string,
      incrementValue,
    });

    return {
      rate: transaction.rate as number,
      user: transaction.user.toString() as string,
      balance: balanceResponse.tokenCredits,
      [transaction.tokenType as string]: incrementValue,
    } as TransactionResult;
  }

  /**
   * Creates a structured transaction and updates the balance.
   */
  async function createStructuredTransaction(
    _txData: TxData,
  ): Promise<TransactionResult | undefined> {
    const { balance, transactions, ...txData } = _txData;
    if (transactions?.enabled === false) {
      return;
    }

    const Transaction = mongoose.models.Transaction;
    const transaction = new Transaction(txData);
    transaction.endpointTokenConfig = txData.endpointTokenConfig;
    transaction.inputTokenCount = txData.inputTokenCount;

    calculateStructuredTokenValue(transaction);

    await transaction.save();

    if (!balance?.enabled) {
      return;
    }

    const incrementValue = transaction.tokenValue as number;

    const balanceResponse = await updateBalance({
      user: transaction.user as string,
      incrementValue,
    });

    return {
      rate: transaction.rate as number,
      user: transaction.user.toString() as string,
      balance: balanceResponse.tokenCredits,
      [transaction.tokenType as string]: incrementValue,
    } as TransactionResult;
  }

  /**
   * Queries and retrieves transactions based on a given filter.
   */
  async function getTransactions(filter: FilterQuery<ITransaction>) {
    try {
      const Transaction = mongoose.models.Transaction;
      return await Transaction.find(filter).lean();
    } catch (error) {
      logger.error('Error querying transactions:', error);
      throw error;
    }
  }

  /** Retrieves a user's balance record. */
  async function findBalanceByUser(user: string): Promise<IBalance | null> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    return Balance.findOne({ user }).lean();
  }

  /** Upserts balance fields for a user. */
  async function upsertBalanceFields(
    user: string,
    fields: IBalanceUpdate,
  ): Promise<IBalance | null> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    return Balance.findOneAndUpdate({ user }, { $set: fields }, { upsert: true, new: true }).lean();
  }

  /** Deletes transactions matching a filter. */
  async function deleteTransactions(filter: FilterQuery<ITransaction>) {
    const Transaction = mongoose.models.Transaction;
    return Transaction.deleteMany(filter);
  }

  /** Deletes balance records matching a filter. */
  async function deleteBalances(filter: FilterQuery<IBalance>) {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    return Balance.deleteMany(filter);
  }

  async function bulkInsertTransactions(docs: TransactionData[]): Promise<void> {
    if (!docs.length) {
      return;
    }
    try {
      const Transaction = mongoose.models.Transaction;
      await Transaction.insertMany(docs);
    } catch (error) {
      logger.error('[bulkInsertTransactions] Error inserting transaction docs:', error);
      throw error;
    }
  }

  /** Row returned by aggregateMonthlyUsage — one per user with activity in the period. */
  interface MonthlyUsageRow {
    user: string;
    name: string | null;
    email: string | null;
    bu: string | null;
    totalCredits: number;
    totalTokens: number;
    messageCount: number;
  }

  /**
   * Aggregates token consumption per user over an optional window (defaults to the current
   * UTC month) and optional BU filter. Sums absolute `tokenValue` over prompt + completion
   * transactions, joined with users to expose name/email/tenantId. Sorted by descending total.
   * Used by GET /api/admin/usage.
   */
  async function aggregateMonthlyUsage(params: UsageQueryParams = {}): Promise<MonthlyUsageRow[]> {
    const Transaction = mongoose.models.Transaction;
    const start = params.start ?? currentMonthStartUTC();
    const end = params.end ?? new Date();
    const buValue = buFilterValue(params.bu);

    return Transaction.aggregate<MonthlyUsageRow>([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          tokenType: { $in: ['prompt', 'completion'] },
        },
      },
      {
        $group: {
          _id: '$user',
          totalCredits: { $sum: { $abs: { $ifNull: ['$tokenValue', 0] } } },
          totalTokens: { $sum: { $abs: { $ifNull: ['$rawAmount', 0] } } },
          messageIds: { $addToSet: '$messageId' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDoc',
        },
      },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          user: { $toString: '$_id' },
          name: { $ifNull: ['$userDoc.name', null] },
          email: { $ifNull: ['$userDoc.email', null] },
          bu: buExpression('$userDoc.email', '$userDoc.tenantId'),
          totalCredits: 1,
          totalTokens: 1,
          messageCount: {
            $size: {
              $filter: {
                input: '$messageIds',
                as: 'm',
                cond: { $and: [{ $ne: ['$$m', null] }, { $ne: ['$$m', undefined] }] },
              },
            },
          },
        },
      },
      ...(buValue !== undefined ? [{ $match: { bu: buValue } }] : []),
      { $sort: { totalCredits: -1 } },
    ]);
  }

  /** Row returned by aggregateUsageByModel — one per model used in the period. */
  interface ModelUsageRow {
    model: string;
    messageCount: number;
    totalCredits: number;
    avgCreditsPerMessage: number;
  }

  /**
   * Aggregates token consumption per model over an optional window (defaults to the current
   * UTC month) and optional BU filter. When a BU is requested, transactions are joined with
   * users before grouping so the BU can be derived from the author's email/tenantId.
   * messageCount counts DISTINCT messageIds. Sorted by descending total, then model ascending.
   * Used by GET /api/admin/usage/models.
   */
  async function aggregateUsageByModel(params: UsageQueryParams = {}): Promise<ModelUsageRow[]> {
    const Transaction = mongoose.models.Transaction;
    const start = params.start ?? currentMonthStartUTC();
    const end = params.end ?? new Date();
    const buValue = buFilterValue(params.bu);

    return Transaction.aggregate<ModelUsageRow>([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          tokenType: { $in: ['prompt', 'completion'] },
        },
      },
      ...(buValue !== undefined
        ? [
            {
              $lookup: {
                from: 'users',
                localField: 'user',
                foreignField: '_id',
                as: 'userDoc',
              },
            },
            { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
            {
              $match: {
                $expr: {
                  $eq: [buExpression('$userDoc.email', '$userDoc.tenantId'), buValue],
                },
              },
            },
          ]
        : []),
      {
        $group: {
          _id: '$model',
          totalCredits: { $sum: { $abs: { $ifNull: ['$tokenValue', 0] } } },
          messageIds: { $addToSet: '$messageId' },
        },
      },
      {
        $project: {
          _id: 0,
          model: { $ifNull: ['$_id', 'unknown'] },
          totalCredits: 1,
          messageCount: {
            $size: {
              $filter: {
                input: '$messageIds',
                as: 'm',
                cond: { $and: [{ $ne: ['$$m', null] }, { $ne: ['$$m', undefined] }] },
              },
            },
          },
        },
      },
      {
        $addFields: {
          avgCreditsPerMessage: {
            $cond: [
              { $gt: ['$messageCount', 0] },
              { $divide: ['$totalCredits', '$messageCount'] },
              0,
            ],
          },
        },
      },
      { $sort: { totalCredits: -1, model: 1 } },
    ]);
  }

  /**
   * Lists the distinct UTC months that have prompt/completion activity (ignores credit/adjustment
   * transactions, so no "phantom" months appear). Sorted most-recent first; label is ISO "YYYY-MM".
   * Used by GET /api/admin/usage/periods to populate the period selector.
   */
  async function listAvailablePeriods(): Promise<AvailablePeriod[]> {
    const Transaction = mongoose.models.Transaction;

    const rows = await Transaction.aggregate<{ year: number; month: number }>([
      { $match: { tokenType: { $in: ['prompt', 'completion'] } } },
      {
        $group: {
          _id: {
            year: { $year: { date: '$createdAt', timezone: 'UTC' } },
            month: { $month: { date: '$createdAt', timezone: 'UTC' } },
          },
        },
      },
      { $project: { _id: 0, year: '$_id.year', month: '$_id.month' } },
      { $sort: { year: -1, month: -1 } },
    ]);

    return rows.map((row) => ({
      year: row.year,
      month: row.month,
      label: `${row.year}-${String(row.month).padStart(2, '0')}`,
    }));
  }

  /** Aggregation stages applying a BU filter via a users $lookup; empty when no BU filter. */
  function buLookupStages(buValue: string | null | undefined, userIdField: string) {
    if (buValue === undefined) {
      return [];
    }
    return [
      { $lookup: { from: 'users', localField: userIdField, foreignField: '_id', as: 'userDoc' } },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $expr: { $eq: [buExpression('$userDoc.email', '$userDoc.tenantId'), buValue] },
        },
      },
    ];
  }

  interface ConversationStats {
    totalConversations: number;
    totalSpend: number;
    avgCostPerConversation: number;
  }

  /**
   * Average spend per conversation over the window/BU: total prompt+completion spend divided by
   * the number of distinct conversationIds (nulls excluded). Returns zeros when there is no activity.
   */
  async function aggregateConversationStats(
    params: UsageQueryParams = {},
  ): Promise<ConversationStats> {
    const Transaction = mongoose.models.Transaction;
    const start = params.start ?? currentMonthStartUTC();
    const end = params.end ?? new Date();
    const buValue = buFilterValue(params.bu);

    const result = await Transaction.aggregate<ConversationStats>([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          tokenType: { $in: ['prompt', 'completion'] },
          conversationId: { $ne: null, $exists: true },
        },
      },
      ...buLookupStages(buValue, 'user'),
      {
        $group: {
          _id: null,
          totalSpend: { $sum: { $abs: { $ifNull: ['$tokenValue', 0] } } },
          conversations: { $addToSet: '$conversationId' },
        },
      },
      {
        $project: {
          _id: 0,
          totalSpend: 1,
          totalConversations: { $size: '$conversations' },
          avgCostPerConversation: {
            $cond: [
              { $gt: [{ $size: '$conversations' }, 0] },
              { $divide: ['$totalSpend', { $size: '$conversations' }] },
              0,
            ],
          },
        },
      },
    ]);

    return result[0] ?? { totalConversations: 0, totalSpend: 0, avgCostPerConversation: 0 };
  }

  interface ConversationsPerUser {
    activeUsers: number;
    totalConversations: number;
    avgConversationsPerActiveUser: number;
  }

  /**
   * Average conversations per active user over the window/BU. Active user = a user with
   * prompt/completion transactions in the window (consistent with the "Active users" KPI).
   * Conversations = distinct conversationIds (nulls excluded). Returns zeros when no activity.
   */
  async function aggregateConversationsPerUser(
    params: UsageQueryParams = {},
  ): Promise<ConversationsPerUser> {
    const Transaction = mongoose.models.Transaction;
    const start = params.start ?? currentMonthStartUTC();
    const end = params.end ?? new Date();
    const buValue = buFilterValue(params.bu);

    const result = await Transaction.aggregate<ConversationsPerUser>([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          tokenType: { $in: ['prompt', 'completion'] },
          conversationId: { $ne: null, $exists: true },
        },
      },
      ...buLookupStages(buValue, 'user'),
      {
        $group: {
          _id: null,
          users: { $addToSet: '$user' },
          conversations: { $addToSet: '$conversationId' },
        },
      },
      {
        $project: {
          _id: 0,
          activeUsers: { $size: '$users' },
          totalConversations: { $size: '$conversations' },
          avgConversationsPerActiveUser: {
            $cond: [
              { $gt: [{ $size: '$users' }, 0] },
              { $divide: [{ $size: '$conversations' }, { $size: '$users' }] },
              0,
            ],
          },
        },
      },
    ]);

    return (
      result[0] ?? { activeUsers: 0, totalConversations: 0, avgConversationsPerActiveUser: 0 }
    );
  }

  /**
   * Counts agents created in the window, filtered by the BU of their author (via users $lookup).
   * Queries the Agent collection. Returns { count: 0 } when none.
   */
  async function countAgentsCreated(params: UsageQueryParams = {}): Promise<{ count: number }> {
    const Agent = mongoose.models.Agent;
    const start = params.start ?? currentMonthStartUTC();
    const end = params.end ?? new Date();
    const buValue = buFilterValue(params.bu);

    const result = await Agent.aggregate<{ count: number }>([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      ...buLookupStages(buValue, 'author'),
      { $count: 'count' },
    ]);

    return { count: result[0]?.count ?? 0 };
  }

  return {
    updateBalance,
    bulkInsertTransactions,
    findBalanceByUser,
    upsertBalanceFields,
    getTransactions,
    deleteTransactions,
    deleteBalances,
    createTransaction,
    createAutoRefillTransaction,
    createStructuredTransaction,
    aggregateMonthlyUsage,
    aggregateUsageByModel,
    listAvailablePeriods,
    aggregateConversationStats,
    aggregateConversationsPerUser,
    countAgentsCreated,
  };
}

export type TransactionMethods = ReturnType<typeof createTransactionMethods>;
