const mongoose = require('mongoose');
const transactionSchema = require('./schema/transaction');
const { getMultiplier } = require('./tx');
const Balance = require('./Balance');

// Method to calculate and set the tokenValue for a transaction
transactionSchema.methods.calculateTokenValue = function () {
  if (!this.valueKey || !this.tokenType) {
    this.tokenValue = this.rawAmount;
  }
  const { valueKey, tokenType } = this;
  const multiplier = getMultiplier({ valueKey, tokenType });
  if (multiplier) {
    this.tokenValue = this.rawAmount * multiplier;
  }
};

// Static method to create a transaction and update the balance
transactionSchema.statics.create = async function (transactionData) {
  const Transaction = this;

  const transaction = new Transaction(transactionData);
  transaction.calculateTokenValue();

  // Save the transaction
  await transaction.save();

  // Adjust the user's balance
  return await Balance.findOneAndUpdate(
    { user: transaction.user },
    { $inc: { tokenCredits: transaction.tokenValue } },
    { upsert: true, new: true },
  );
};

module.exports = mongoose.model('Transaction', transactionSchema);
