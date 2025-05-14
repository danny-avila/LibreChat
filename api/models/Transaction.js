const mongoose = require('mongoose');
const { transactionSchema } = require('@librechat/data-schemas');
const { getBalanceConfig } = require('~/server/services/Config');
const { getMultiplier, getCacheMultiplier } = require('./tx');
const { logger } = require('~/config');
const Balance = require('./Balance');

const cancelRate = 1.15;

/**
 * Updates a user's token balance based on a transaction using optimistic concurrency control
 * without schema changes. Compatible with DocumentDB.
 * @async
 * @function
 * @param {Object} params - The function parameters.
 * @param {string|mongoose.Types.ObjectId} params.user - The user ID.
 * @param {number} params.incrementValue - The value to increment the balance by (can be negative).
 * @param {import('mongoose').UpdateQuery<import('@librechat/data-schemas').IBalance>['$set']} [params.setValues] - Optional additional fields to set.
 * @returns {Promise<Object>} Returns the updated balance document (lean).
 * @throws {Error} Throws an error if the update fails after multiple retries.
 */
const updateBalance = async ({ user, incrementValue, setValues }) => {
  let maxRetries = 10; // Number of times to retry on conflict
  let delay = 50; // Initial retry delay in ms
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let currentBalanceDoc;
    try {
      // 1. Read the current document state
      currentBalanceDoc = await Balance.findOne({ user }).lean();
      const currentCredits = currentBalanceDoc ? currentBalanceDoc.tokenCredits : 0;

      // 2. Calculate the desired new state
      const potentialNewCredits = currentCredits + incrementValue;
      const newCredits = Math.max(0, potentialNewCredits); // Ensure balance doesn't go below zero

      // 3. Prepare the update payload
      const updatePayload = {
        $set: {
          tokenCredits: newCredits,
          ...(setValues || {}), // Merge other values to set
        },
      };

      // 4. Attempt the conditional update or upsert
      let updatedBalance = null;
      if (currentBalanceDoc) {
        // --- Document Exists: Perform Conditional Update ---
        // Try to update only if the tokenCredits match the value we read (currentCredits)
        updatedBalance = await Balance.findOneAndUpdate(
          {
            user: user,
            tokenCredits: currentCredits, // Optimistic lock: condition based on the read value
          },
          updatePayload,
          {
            new: true, // Return the modified document
            // lean: true, // .lean() is applied after query execution in Mongoose >= 6
          },
        ).lean(); // Use lean() for plain JS object

        if (updatedBalance) {
          // Success! The update was applied based on the expected current state.
          return updatedBalance;
        }
        // If updatedBalance is null, it means tokenCredits changed between read and write (conflict).
        lastError = new Error(`Concurrency conflict for user ${user} on attempt ${attempt}.`);
        // Proceed to retry logic below.
      } else {
        // --- Document Does Not Exist: Perform Conditional Upsert ---
        // Try to insert the document, but only if it still doesn't exist.
        // Using tokenCredits: {$exists: false} helps prevent race conditions where
        // another process creates the doc between our findOne and findOneAndUpdate.
        try {
          updatedBalance = await Balance.findOneAndUpdate(
            {
              user: user,
              // Attempt to match only if the document doesn't exist OR was just created
              // without tokenCredits (less likely but possible). A simple { user } filter
              // might also work, relying on the retry for conflicts.
              // Let's use a simpler filter and rely on retry for races.
              // tokenCredits: { $exists: false } // This condition might be too strict if doc exists with 0 credits
            },
            updatePayload,
            {
              upsert: true, // Create if doesn't exist
              new: true, // Return the created/updated document
              // setDefaultsOnInsert: true, // Ensure schema defaults are applied on insert
              // lean: true,
            },
          ).lean();

          if (updatedBalance) {
            // Upsert succeeded (likely created the document)
            return updatedBalance;
          }
          // If null, potentially a rare race condition during upsert. Retry should handle it.
          lastError = new Error(
            `Upsert race condition suspected for user ${user} on attempt ${attempt}.`,
          );
        } catch (error) {
          if (error.code === 11000) {
            // E11000 duplicate key error on index
            // This means another process created the document *just* before our upsert.
            // It's a concurrency conflict during creation. We should retry.
            lastError = error; // Store the error
            // Proceed to retry logic below.
          } else {
            // Different error, rethrow
            throw error;
          }
        }
      } // End if/else (document exists?)
    } catch (error) {
      // Catch errors from findOne or unexpected findOneAndUpdate errors
      logger.error(`[updateBalance] Error during attempt ${attempt} for user ${user}:`, error);
      lastError = error; // Store the error
      // Consider stopping retries for non-transient errors, but for now, we retry.
    }

    // If we reached here, it means the update failed (conflict or error), wait and retry
    if (attempt < maxRetries) {
      const jitter = Math.random() * delay * 0.5; // Add jitter to delay
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      delay = Math.min(delay * 2, 2000); // Exponential backoff with cap
    }
  } // End for loop (retries)

  // If loop finishes without success, throw the last encountered error or a generic one
  logger.error(
    `[updateBalance] Failed to update balance for user ${user} after ${maxRetries} attempts.`,
  );
  throw (
    lastError ||
    new Error(
      `Failed to update balance for user ${user} after maximum retries due to persistent conflicts.`,
    )
  );
};

/** Method to calculate and set the tokenValue for a transaction */
transactionSchema.methods.calculateTokenValue = function () {
  if (!this.valueKey || !this.tokenType) {
    this.tokenValue = this.rawAmount;
  }
  const { valueKey, tokenType, model, endpointTokenConfig } = this;
  const multiplier = Math.abs(getMultiplier({ valueKey, tokenType, model, endpointTokenConfig }));
  this.rate = multiplier;
  this.tokenValue = this.rawAmount * multiplier;
  if (this.context && this.tokenType === 'completion' && this.context === 'incomplete') {
    this.tokenValue = Math.ceil(this.tokenValue * cancelRate);
    this.rate *= cancelRate;
  }
};

/**
 * New static method to create an auto-refill transaction that does NOT trigger a balance update.
 * @param {object} txData - Transaction data.
 * @param {string} txData.user - The user ID.
 * @param {string} txData.tokenType - The type of token.
 * @param {string} txData.context - The context of the transaction.
 * @param {number} txData.rawAmount - The raw amount of tokens.
 * @returns {Promise<object>} - The created transaction.
 */
transactionSchema.statics.createAutoRefillTransaction = async function (txData) {
  if (txData.rawAmount != null && isNaN(txData.rawAmount)) {
    return;
  }
  const transaction = new this(txData);
  transaction.endpointTokenConfig = txData.endpointTokenConfig;
  transaction.calculateTokenValue();
  await transaction.save();

  const balanceResponse = await updateBalance({
    user: transaction.user,
    incrementValue: txData.rawAmount,
    setValues: { lastRefill: new Date() },
  });
  const result = {
    rate: transaction.rate,
    user: transaction.user.toString(),
    balance: balanceResponse.tokenCredits,
  };
  logger.debug('[Balance.check] Auto-refill performed', result);
  result.transaction = transaction;
  return result;
};

/**
 * Static method to create a transaction and update the balance
 * @param {txData} txData - Transaction data.
 */
transactionSchema.statics.create = async function (txData) {
  const Transaction = this;
  if (txData.rawAmount != null && isNaN(txData.rawAmount)) {
    return;
  }

  const transaction = new Transaction(txData);
  transaction.endpointTokenConfig = txData.endpointTokenConfig;
  transaction.calculateTokenValue();

  await transaction.save();

  const balance = await getBalanceConfig();
  if (!balance?.enabled) {
    return;
  }

  let incrementValue = transaction.tokenValue;

  const balanceResponse = await updateBalance({
    user: transaction.user,
    incrementValue,
  });

  return {
    rate: transaction.rate,
    user: transaction.user.toString(),
    balance: balanceResponse.tokenCredits,
    [transaction.tokenType]: incrementValue,
  };
};

/**
 * Static method to create a structured transaction and update the balance
 * @param {txData} txData - Transaction data.
 */
transactionSchema.statics.createStructured = async function (txData) {
  const Transaction = this;

  const transaction = new Transaction({
    ...txData,
    endpointTokenConfig: txData.endpointTokenConfig,
  });

  transaction.calculateStructuredTokenValue();

  await transaction.save();

  const balance = await getBalanceConfig();
  if (!balance?.enabled) {
    return;
  }

  let incrementValue = transaction.tokenValue;

  const balanceResponse = await updateBalance({
    user: transaction.user,
    incrementValue,
  });

  return {
    rate: transaction.rate,
    user: transaction.user.toString(),
    balance: balanceResponse.tokenCredits,
    [transaction.tokenType]: incrementValue,
  };
};

/** Method to calculate token value for structured tokens */
transactionSchema.methods.calculateStructuredTokenValue = function () {
  if (!this.tokenType) {
    this.tokenValue = this.rawAmount;
    return;
  }

  const { model, endpointTokenConfig } = this;

  if (this.tokenType === 'prompt') {
    const inputMultiplier = getMultiplier({ tokenType: 'prompt', model, endpointTokenConfig });
    const writeMultiplier =
      getCacheMultiplier({ cacheType: 'write', model, endpointTokenConfig }) ?? inputMultiplier;
    const readMultiplier =
      getCacheMultiplier({ cacheType: 'read', model, endpointTokenConfig }) ?? inputMultiplier;

    this.rateDetail = {
      input: inputMultiplier,
      write: writeMultiplier,
      read: readMultiplier,
    };

    const totalPromptTokens =
      Math.abs(this.inputTokens || 0) +
      Math.abs(this.writeTokens || 0) +
      Math.abs(this.readTokens || 0);

    if (totalPromptTokens > 0) {
      this.rate =
        (Math.abs(inputMultiplier * (this.inputTokens || 0)) +
          Math.abs(writeMultiplier * (this.writeTokens || 0)) +
          Math.abs(readMultiplier * (this.readTokens || 0))) /
        totalPromptTokens;
    } else {
      this.rate = Math.abs(inputMultiplier); // Default to input rate if no tokens
    }

    this.tokenValue = -(
      Math.abs(this.inputTokens || 0) * inputMultiplier +
      Math.abs(this.writeTokens || 0) * writeMultiplier +
      Math.abs(this.readTokens || 0) * readMultiplier
    );

    this.rawAmount = -totalPromptTokens;
  } else if (this.tokenType === 'completion') {
    const multiplier = getMultiplier({ tokenType: this.tokenType, model, endpointTokenConfig });
    this.rate = Math.abs(multiplier);
    this.tokenValue = -Math.abs(this.rawAmount) * multiplier;
    this.rawAmount = -Math.abs(this.rawAmount);
  }

  if (this.context && this.tokenType === 'completion' && this.context === 'incomplete') {
    this.tokenValue = Math.ceil(this.tokenValue * cancelRate);
    this.rate *= cancelRate;
    if (this.rateDetail) {
      this.rateDetail = Object.fromEntries(
        Object.entries(this.rateDetail).map(([k, v]) => [k, v * cancelRate]),
      );
    }
  }
};

const Transaction = mongoose.model('Transaction', transactionSchema);

/**
 * Queries and retrieves transactions based on a given filter.
 * @async
 * @function getTransactions
 * @param {Object} filter - MongoDB filter object to apply when querying transactions.
 * @returns {Promise<Array>} A promise that resolves to an array of matched transactions.
 * @throws {Error} Throws an error if querying the database fails.
 */
async function getTransactions(filter) {
  try {
    return await Transaction.find(filter).lean();
  } catch (error) {
    logger.error('Error querying transactions:', error);
    throw error;
  }
}

module.exports = { Transaction, getTransactions };
