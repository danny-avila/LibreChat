const mongoose = require('mongoose');
const transactionSchema = require('./schema/transaction');
const Balance = require('./Balance');

const tokenValueConfig = {
  '8K': { prompt: 3, completion: 6 },
  '32K': { prompt: 6, completion: 12 },
  '4K': { prompt: 1.5, completion: 2 },
  '16K': { prompt: 3, completion: 4 },
};

// Static method to get token value based on valueKey and type
const getMultiplier = (valueKey, tokenType) => {
  const values = tokenValueConfig[valueKey];
  if (!values) {
    return 1;
  }
  return values[tokenType];
};

// Method to calculate and set the tokenValue for a transaction
transactionSchema.methods.calculateTokenValue = function () {
  if (!this.valueKey || !this.tokenType) {
    this.tokenValue = this.rawAmount;
  }
  const multiplier = getMultiplier(this.valueKey, this.tokenType);
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
    { $inc: { tokens: transaction.tokenValue } },
    { upsert: true, new: true },
  );
};

module.exports = mongoose.model('Transaction', transactionSchema);
