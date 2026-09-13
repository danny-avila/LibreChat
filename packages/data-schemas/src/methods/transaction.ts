import { getRefillEligibilityDate } from 'librechat-data-provider';
import type { FilterQuery, Model, Types } from 'mongoose';
import type {
  BalanceReservationRequest,
  BalanceReservationResult,
  IBalanceUpdate,
  TransactionData,
  IBalance,
} from '~/types';
import type { ITransaction } from '~/schema/transaction';
import logger from '~/config/winston';

const cancelRate = 1.15;
const maxReservationAttempts = 10;

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
  inputTokenCount?: number;
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
): {
  updateBalance: ({
    user,
    incrementValue,
    setValues,
  }: {
    user: string;
    incrementValue: number;
    setValues?: IBalanceUpdate;
  }) => Promise<IBalance>;
  bulkInsertTransactions: (docs: TransactionData[]) => Promise<void>;
  findBalanceByUser: (user: string) => Promise<IBalance | null>;
  upsertBalanceFields: (user: string, fields: IBalanceUpdate) => Promise<IBalance | null>;
  getTransactions: (filter: FilterQuery<ITransaction>) => Promise<ITransaction[]>;
  deleteTransactions: (
    filter: FilterQuery<ITransaction>,
  ) => Promise<import('mongodb').DeleteResult>;
  deleteBalances: (filter: FilterQuery<IBalance>) => Promise<import('mongodb').DeleteResult>;
  createTransaction: (_txData: TxData) => Promise<TransactionResult | undefined>;
  reserveBalance: (request: BalanceReservationRequest) => Promise<BalanceReservationResult | null>;
  releaseBalanceReservation: (params: { user: string; reservationId: string }) => Promise<void>;
  createStructuredTransaction: (_txData: TxData) => Promise<TransactionResult | undefined>;
} {
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
          inputTokenCount,
        }) ?? inputMultiplier;
      const readMultiplier =
        txMethods.getCacheMultiplier({
          cacheType: 'read',
          model,
          endpointTokenConfig: etConfig,
          inputTokenCount,
        }) ?? inputMultiplier;

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
      let currentBalanceDoc: IBalance | null;
      try {
        currentBalanceDoc = await Balance.findOne({ user }).lean<IBalance>();
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
          ).lean<IBalance>();

          if (updatedBalance) {
            return updatedBalance;
          }
          lastError = new Error(`Concurrency conflict for user ${user} on attempt ${attempt}.`);
        } else {
          try {
            updatedBalance = await Balance.findOneAndUpdate({ user }, updatePayload, {
              upsert: true,
              new: true,
            }).lean<IBalance>();

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

  function isAutoRefillDue(record: IBalance, now: Date): boolean {
    if (!record.autoRefillEnabled || !(record.refillAmount > 0)) {
      return false;
    }
    const lastRefill = new Date(record.lastRefill ?? 0);
    if (isNaN(lastRefill.getTime())) {
      return true;
    }
    return (
      now >=
      getRefillEligibilityDate(
        lastRefill,
        record.refillIntervalValue ?? 0,
        record.refillIntervalUnit ?? 'days',
      )
    );
  }

  async function recordAutoRefill(user: string, rawAmount: number): Promise<void> {
    try {
      const Transaction = mongoose.models.Transaction;
      const transaction = new Transaction({
        user,
        tokenType: 'credits',
        context: 'autoRefill',
        rawAmount,
      });
      calculateTokenValue(transaction);
      await transaction.save();
      logger.debug('[Balance.reserve] Auto-refill performed', { user, rawAmount });
    } catch (error) {
      logger.error('[Balance.reserve] Failed to record auto-refill transaction', error);
    }
  }

  /**
   * Admits one request against the credits that in-flight requests have not already reserved,
   * and holds its amount until released or expired. A due auto-refill is applied in the same
   * write. The write is fenced on every value the decision read, so concurrent admissions and
   * refills re-read instead of admitting against, or refilling from, a stale balance.
   * Returns null when the user has no balance record.
   */
  async function reserveBalance({
    user,
    reservationId,
    amount,
    expiresAt,
  }: BalanceReservationRequest): Promise<BalanceReservationResult | null> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    let delay = 25;

    for (let attempt = 1; attempt <= maxReservationAttempts; attempt++) {
      const record = await Balance.findOne({ user }).select('+reservations').lean<IBalance>();
      if (!record) {
        return null;
      }

      const now = new Date();
      const credits = record.tokenCredits ?? 0;
      const active = (record.reservations ?? []).filter(
        (reservation) => reservation.expiresAt > now,
      );
      const held = active.reduce((sum, reservation) => sum + reservation.amount, 0);
      const refill = credits - held - amount <= 0 && isAutoRefillDue(record, now);
      const nextCredits = refill ? Math.max(0, credits + record.refillAmount) : credits;
      const balance = nextCredits - held;
      const reserved = balance >= amount;
      const holds = reserved && amount > 0;

      if (!refill && !holds) {
        return { reserved, balance };
      }

      const update: Pick<Partial<IBalance>, 'reservations' | 'tokenCredits' | 'lastRefill'> = {};
      if (holds) {
        update.reservations = [...active, { id: reservationId, amount, expiresAt }];
      }
      if (refill) {
        update.tokenCredits = nextCredits;
        update.lastRefill = now;
      }

      const fence: FilterQuery<IBalance> = {
        _id: record._id,
        tokenCredits: record.tokenCredits ?? null,
        reservations: record.reservations ?? null,
      };
      if (refill) {
        fence.lastRefill = record.lastRefill ?? null;
      }

      const result = await Balance.updateOne(fence, { $set: update });
      if (result.matchedCount === 1) {
        if (refill) {
          await recordAutoRefill(user, record.refillAmount);
        }
        return { reserved, balance };
      }

      if (attempt < maxReservationAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay + Math.random() * delay));
        delay = Math.min(delay * 2, 1000);
      }
    }

    throw new Error(`Balance reservation for user ${user} exceeded its retry bound.`);
  }

  /** Releases an in-flight reservation; releasing an unknown or expired id is a no-op. */
  async function releaseBalanceReservation({
    user,
    reservationId,
  }: {
    user: string;
    reservationId: string;
  }): Promise<void> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    await Balance.updateOne(
      { user, 'reservations.id': reservationId },
      { $pull: { reservations: { id: reservationId } } },
    );
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
  async function getTransactions(filter: FilterQuery<ITransaction>): Promise<ITransaction[]> {
    try {
      const Transaction = mongoose.models.Transaction;
      return await Transaction.find(filter).lean<ITransaction[]>();
    } catch (error) {
      logger.error('Error querying transactions:', error);
      throw error;
    }
  }

  /** Retrieves a user's balance record. */
  async function findBalanceByUser(user: string): Promise<IBalance | null> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    return Balance.findOne({ user }).lean<IBalance>();
  }

  /** Upserts balance fields for a user. */
  async function upsertBalanceFields(
    user: string,
    fields: IBalanceUpdate,
  ): Promise<IBalance | null> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    return Balance.findOneAndUpdate(
      { user },
      { $set: fields },
      { upsert: true, new: true },
    ).lean<IBalance>();
  }

  /** Deletes transactions matching a filter. */
  async function deleteTransactions(
    filter: FilterQuery<ITransaction>,
  ): Promise<import('mongodb').DeleteResult> {
    const Transaction = mongoose.models.Transaction;
    return Transaction.deleteMany(filter);
  }

  /** Deletes balance records matching a filter. */
  async function deleteBalances(
    filter: FilterQuery<IBalance>,
  ): Promise<import('mongodb').DeleteResult> {
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

  return {
    updateBalance,
    bulkInsertTransactions,
    findBalanceByUser,
    upsertBalanceFields,
    getTransactions,
    deleteTransactions,
    deleteBalances,
    createTransaction,
    reserveBalance,
    releaseBalanceReservation,
    createStructuredTransaction,
  };
}

export type TransactionMethods = ReturnType<typeof createTransactionMethods>;
