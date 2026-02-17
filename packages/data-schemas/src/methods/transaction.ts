import type { Model } from 'mongoose';
import logger from '~/config/winston';
import type { IBalance } from '~/types';

const cancelRate = 1.15;

export function createTransactionMethods(
  mongoose: typeof import('mongoose'),
  txMethods: {
    getMultiplier: (params: Record<string, unknown>) => number;
    getCacheMultiplier: (params: Record<string, unknown>) => number | null;
  },
) {
  /** Calculate and set the tokenValue for a transaction */
  function calculateTokenValue(txn: Record<string, unknown>) {
    const { valueKey, tokenType, model, endpointTokenConfig, inputTokenCount } = txn;
    const multiplier = Math.abs(
      txMethods.getMultiplier({ valueKey, tokenType, model, endpointTokenConfig, inputTokenCount }),
    );
    txn.rate = multiplier;
    txn.tokenValue = (txn.rawAmount as number) * multiplier;
    if (txn.context && txn.tokenType === 'completion' && txn.context === 'incomplete') {
      txn.tokenValue = Math.ceil((txn.tokenValue as number) * cancelRate);
      txn.rate = (txn.rate as number) * cancelRate;
    }
  }

  /** Calculate token value for structured tokens */
  function calculateStructuredTokenValue(txn: Record<string, unknown>) {
    if (!txn.tokenType) {
      txn.tokenValue = txn.rawAmount;
      return;
    }

    const { model, endpointTokenConfig, inputTokenCount } = txn;

    if (txn.tokenType === 'prompt') {
      const inputMultiplier = txMethods.getMultiplier({
        tokenType: 'prompt',
        model,
        endpointTokenConfig,
        inputTokenCount,
      });
      const writeMultiplier =
        txMethods.getCacheMultiplier({ cacheType: 'write', model, endpointTokenConfig }) ??
        inputMultiplier;
      const readMultiplier =
        txMethods.getCacheMultiplier({ cacheType: 'read', model, endpointTokenConfig }) ??
        inputMultiplier;

      txn.rateDetail = {
        input: inputMultiplier,
        write: writeMultiplier,
        read: readMultiplier,
      };

      const totalPromptTokens =
        Math.abs((txn.inputTokens as number) || 0) +
        Math.abs((txn.writeTokens as number) || 0) +
        Math.abs((txn.readTokens as number) || 0);

      if (totalPromptTokens > 0) {
        txn.rate =
          (Math.abs(inputMultiplier * ((txn.inputTokens as number) || 0)) +
            Math.abs(writeMultiplier * ((txn.writeTokens as number) || 0)) +
            Math.abs(readMultiplier * ((txn.readTokens as number) || 0))) /
          totalPromptTokens;
      } else {
        txn.rate = Math.abs(inputMultiplier);
      }

      txn.tokenValue = -(
        Math.abs((txn.inputTokens as number) || 0) * inputMultiplier +
        Math.abs((txn.writeTokens as number) || 0) * writeMultiplier +
        Math.abs((txn.readTokens as number) || 0) * readMultiplier
      );

      txn.rawAmount = -totalPromptTokens;
    } else if (txn.tokenType === 'completion') {
      const multiplier = txMethods.getMultiplier({
        tokenType: txn.tokenType,
        model,
        endpointTokenConfig,
        inputTokenCount,
      });
      txn.rate = Math.abs(multiplier);
      txn.tokenValue = -Math.abs(txn.rawAmount as number) * multiplier;
      txn.rawAmount = -Math.abs(txn.rawAmount as number);
    }

    if (txn.context && txn.tokenType === 'completion' && txn.context === 'incomplete') {
      txn.tokenValue = Math.ceil((txn.tokenValue as number) * cancelRate);
      txn.rate = (txn.rate as number) * cancelRate;
      if (txn.rateDetail) {
        txn.rateDetail = Object.fromEntries(
          Object.entries(txn.rateDetail as Record<string, number>).map(([k, v]) => [
            k,
            v * cancelRate,
          ]),
        );
      }
    }
  }

  /**
   * Updates a user's token balance using optimistic concurrency control.
   */
  async function updateBalance({
    user,
    incrementValue,
    setValues,
  }: {
    user: string;
    incrementValue: number;
    setValues?: Record<string, unknown>;
  }) {
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
            ...(setValues || {}),
          },
        };

        let updatedBalance = null;
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
            if ((error as { code?: number }).code === 11000) {
              lastError = error as Error;
            } else {
              throw error;
            }
          }
        }
      } catch (error) {
        logger.error(`[updateBalance] Error during attempt ${attempt} for user ${user}:`, error);
        lastError = error as Error;
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
      lastError ||
      new Error(
        `Failed to update balance for user ${user} after maximum retries due to persistent conflicts.`,
      )
    );
  }

  /**
   * Creates an auto-refill transaction that also updates balance.
   */
  async function createAutoRefillTransaction(txData: Record<string, unknown>) {
    if (txData.rawAmount != null && isNaN(txData.rawAmount as number)) {
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
      incrementValue: txData.rawAmount as number,
      setValues: { lastRefill: new Date() },
    });
    const result: Record<string, unknown> = {
      rate: transaction.rate,
      user: transaction.user.toString(),
      balance: (balanceResponse as Record<string, unknown>).tokenCredits,
    };
    logger.debug('[Balance.check] Auto-refill performed', result);
    result.transaction = transaction;
    return result;
  }

  /**
   * Creates a transaction and updates the balance.
   */
  async function createTransaction(_txData: Record<string, unknown>) {
    const { balance, transactions, ...txData } = _txData;
    if (txData.rawAmount != null && isNaN(txData.rawAmount as number)) {
      return;
    }

    if ((transactions as Record<string, unknown>)?.enabled === false) {
      return;
    }

    const Transaction = mongoose.models.Transaction;
    const transaction = new Transaction(txData);
    transaction.endpointTokenConfig = txData.endpointTokenConfig;
    transaction.inputTokenCount = txData.inputTokenCount;
    calculateTokenValue(transaction);

    await transaction.save();
    if (!(balance as Record<string, unknown>)?.enabled) {
      return;
    }

    const incrementValue = transaction.tokenValue as number;
    const balanceResponse = await updateBalance({
      user: transaction.user as string,
      incrementValue,
    });

    return {
      rate: transaction.rate,
      user: transaction.user.toString(),
      balance: (balanceResponse as Record<string, unknown>).tokenCredits,
      [transaction.tokenType as string]: incrementValue,
    };
  }

  /**
   * Creates a structured transaction and updates the balance.
   */
  async function createStructuredTransaction(_txData: Record<string, unknown>) {
    const { balance, transactions, ...txData } = _txData;
    if ((transactions as Record<string, unknown>)?.enabled === false) {
      return;
    }

    const Transaction = mongoose.models.Transaction;
    const transaction = new Transaction(txData);
    transaction.endpointTokenConfig = txData.endpointTokenConfig;
    transaction.inputTokenCount = txData.inputTokenCount;

    calculateStructuredTokenValue(transaction);

    await transaction.save();

    if (!(balance as Record<string, unknown>)?.enabled) {
      return;
    }

    const incrementValue = transaction.tokenValue as number;

    const balanceResponse = await updateBalance({
      user: transaction.user as string,
      incrementValue,
    });

    return {
      rate: transaction.rate,
      user: transaction.user.toString(),
      balance: (balanceResponse as Record<string, unknown>).tokenCredits,
      [transaction.tokenType as string]: incrementValue,
    };
  }

  /**
   * Queries and retrieves transactions based on a given filter.
   */
  async function getTransactions(filter: Record<string, unknown>) {
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
    fields: Record<string, unknown>,
  ): Promise<unknown> {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    return Balance.findOneAndUpdate({ user }, { $set: fields }, { upsert: true, new: true }).lean();
  }

  /** Deletes transactions matching a filter. */
  async function deleteTransactions(filter: Record<string, unknown>) {
    const Transaction = mongoose.models.Transaction;
    return Transaction.deleteMany(filter);
  }

  /** Deletes balance records matching a filter. */
  async function deleteBalances(filter: Record<string, unknown>) {
    const Balance = mongoose.models.Balance as Model<IBalance>;
    return Balance.deleteMany(filter);
  }

  return {
    findBalanceByUser,
    upsertBalanceFields,
    getTransactions,
    deleteTransactions,
    deleteBalances,
    createTransaction,
    createAutoRefillTransaction,
    createStructuredTransaction,
  };
}

export type TransactionMethods = ReturnType<typeof createTransactionMethods>;
