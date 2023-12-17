const mongoose = require('mongoose');
const { isEnabled } = require('../server/utils/handleText');
const transactionSchema = require('./schema/transaction');
const { getMultiplier } = require('./tx');
const Balance = require('./Balance');
const cancelRate = 1.15;

// Method to calculate and set the tokenValue for a transaction
transactionSchema.methods.calculateTokenValue = function () {
  if (!this.valueKey || !this.tokenType) {
    this.tokenValue = this.rawAmount;
  }
  const { valueKey, tokenType, model } = this;
  const multiplier = getMultiplier({ valueKey, tokenType, model });
  this.rate = multiplier;
  this.tokenValue = this.rawAmount * multiplier;
  if (this.context && this.tokenType === 'completion' && this.context === 'incomplete') {
    this.tokenValue = Math.ceil(this.tokenValue * cancelRate);
    this.rate *= cancelRate;
  }
};

// Static method to create a transaction and update the balance
transactionSchema.statics.create = async function (transactionData) {
  const Transaction = this;

  const transaction = new Transaction(transactionData);
  transaction.calculateTokenValue();

  // Save the transaction
  await transaction.save();

  if (!isEnabled(process.env.CHECK_BALANCE)) {
    return;
  }

  // Adjust the user's balance
  return await Balance.findOneAndUpdate(
    { user: transaction.user },
    { $inc: { tokenCredits: transaction.tokenValue } },
    { upsert: true, new: true },
  ).lean();
};

module.exports = mongoose.model('Transaction', transactionSchema);
