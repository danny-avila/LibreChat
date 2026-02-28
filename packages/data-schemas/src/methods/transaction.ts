import type { IBalance, TransactionData } from '~/types';
import logger from '~/config/winston';

interface UpdateBalanceParams {
  user: string;
  incrementValue: number;
  setValues?: Partial<Pick<IBalance, 'tokenCredits'>>;
}

export function createTransactionMethods(mongoose: typeof import('mongoose')) {
  async function updateBalance({ user, incrementValue, setValues }: UpdateBalanceParams) {
    const maxRetries = 10;
    let delay = 50;
    let lastError: Error | null = null;
    const Balance = mongoose.models.Balance;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const currentBalanceDoc = await Balance.findOne({ user }).lean<IBalance>();
        const currentCredits = currentBalanceDoc?.tokenCredits ?? 0;
        const newCredits = Math.max(0, currentCredits + incrementValue);

        const updatePayload = {
          $set: {
            tokenCredits: newCredits,
            ...(setValues ?? {}),
          },
        };

        if (currentBalanceDoc) {
          const updatedBalance = await Balance.findOneAndUpdate(
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
            const updatedBalance = await Balance.findOneAndUpdate({ user }, updatePayload, {
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

  /** Bypasses document middleware; all computed fields must be pre-calculated before calling. */
  async function bulkInsertTransactions(docs: TransactionData[]): Promise<void> {
    const Transaction = mongoose.models.Transaction;
    if (docs.length) {
      await Transaction.insertMany(docs);
    }
  }

  return { updateBalance, bulkInsertTransactions };
}

export type TransactionMethods = ReturnType<typeof createTransactionMethods>;
