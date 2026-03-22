import type { IBalance, TransactionData } from '~/types';
import logger from '~/config/winston';

interface UpdateBalanceParams {
  user: string;
  incrementValue: number;
  /** When provided, debits/credits the per-spec bucket instead of the global tokenCredits. */
  specName?: string;
  /**
   * The starting balance to use when the per-spec bucket does not yet exist (lazy init).
   * Only used when specName is provided and the bucket key is missing from the document.
   */
  specStartBalance?: number;
  setValues?: Partial<Pick<IBalance, 'tokenCredits' | 'lastRefill'>> & {
    /** Used to record the per-spec last-refill timestamp when auto-refill fires for a spec. */
    perModelSpecLastRefillEntry?: { specName: string; date: Date };
  };
}

export function createTransactionMethods(mongoose: typeof import('mongoose')) {
  async function updateBalance({
    user,
    incrementValue,
    specName,
    specStartBalance,
    setValues,
  }: UpdateBalanceParams) {
    const maxRetries = 10;
    let delay = 50;
    let lastError: Error | null = null;
    const Balance = mongoose.models.Balance;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const currentBalanceDoc = await Balance.findOne({ user }).lean<IBalance>();

        if (specName != null) {
          // --- Per-spec isolated bucket path ---
          // Read the current map from the lean doc (plain object after .lean()).
          // We avoid dot-notation ($set "perModelSpecTokenCredits.specName") because
          // MongoDB splits on dots, corrupting spec names that contain them.
          // We also avoid Mongoose Map hydration (.set/.get) because old documents
          // that pre-date the field return undefined for the Map instance.
          // Instead, we merge the full map as a plain object in a single $set.
          const specsMap = (currentBalanceDoc?.perModelSpecTokenCredits ?? {}) as Record<
            string,
            unknown
          >;
          // Only carry forward scalar number entries to avoid perpetuating corruption
          // from prior dot-splitting writes.
          const cleanMap: Record<string, number> = Object.fromEntries(
            Object.entries(specsMap).filter((e): e is [string, number] => typeof e[1] === 'number'),
          );
          const hasEntry = Object.prototype.hasOwnProperty.call(cleanMap, specName);
          const currentSpecCredits = hasEntry ? (cleanMap[specName] ?? 0) : (specStartBalance ?? 0);
          const newSpecCredits = Math.max(0, currentSpecCredits + incrementValue);

          const setPayload: Record<string, unknown> = {
            perModelSpecTokenCredits: { ...cleanMap, [specName]: newSpecCredits },
          };

          if (setValues?.perModelSpecLastRefillEntry?.specName === specName) {
            // Same approach for the lastRefill map
            const lastRefillMap = (currentBalanceDoc?.perModelSpecLastRefill ?? {}) as Record<
              string,
              unknown
            >;
            const cleanLastRefill: Record<string, Date> = Object.fromEntries(
              Object.entries(lastRefillMap).filter(
                (e): e is [string, Date] =>
                  e[1] instanceof Date ||
                  (typeof e[1] === 'string' && !isNaN(Date.parse(e[1] as string))),
              ),
            );
            setPayload.perModelSpecLastRefill = {
              ...cleanLastRefill,
              [specName]: setValues.perModelSpecLastRefillEntry.date,
            };
          }

          // Optimistic concurrency: re-read the live spec value and retry on conflict.
          const liveDoc = await Balance.findOne({ user }).lean<IBalance>();
          const liveMap = (liveDoc?.perModelSpecTokenCredits ?? {}) as Record<string, unknown>;
          const liveCredits =
            typeof liveMap[specName] === 'number'
              ? (liveMap[specName] as number)
              : (specStartBalance ?? 0);

          if (hasEntry && liveCredits !== currentSpecCredits) {
            lastError = new Error(
              `Concurrency conflict for user ${user} spec ${specName} on attempt ${attempt}.`,
            );
          } else {
            const updatedBalance = await Balance.findOneAndUpdate(
              { user },
              { $set: setPayload },
              { upsert: true, new: true },
            ).lean();

            if (updatedBalance) {
              return updatedBalance;
            }
            lastError = new Error(
              `Upsert race for user ${user} spec ${specName} on attempt ${attempt}.`,
            );
          }
        } else {
          // --- Global tokenCredits path (unchanged behaviour) ---
          const currentCredits = currentBalanceDoc?.tokenCredits ?? 0;
          const newCredits = Math.max(0, currentCredits + incrementValue);

          const updatePayload = {
            $set: {
              tokenCredits: newCredits,
              ...(setValues != null
                ? Object.fromEntries(
                    Object.entries(setValues).filter(([k]) => k !== 'perModelSpecLastRefillEntry'),
                  )
                : {}),
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
