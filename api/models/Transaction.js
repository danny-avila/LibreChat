const mongoose = require('mongoose');
const transactionSchema = require('./schema/transaction');
const Balance = require('./Balance');

const tokenValueConfig = {
  '8K': { promptTokens: 3, completionTokens: 6 },
  '32K': { promptTokens: 6, completionTokens: 12 },
  '4K': { promptTokens: 1.5, completionTokens: 2 },
  '16K': { promptTokens: 3, completionTokens: 4 },
};

// Static method to get token value based on valueKey and type
transactionSchema.statics.getTokenValue = function (valueKey, tokenType) {
  const values = tokenValueConfig[valueKey];
  if (!values) {
    return null;
  }
  return values[tokenType];
};

// Method to calculate and set the tokenValue for a transaction
transactionSchema.methods.calculateTokenValue = function () {
  const value = this.model('Transaction').getTokenValue(this.valueKey, this.tokenType);
  if (value) {
    this.tokenValue = this.rawAmount * value;
  }
};

// Static method to create a transaction and update the balance
transactionSchema.statics.createAndAdjustBalance = async function (transactionData) {
  const Transaction = this;

  const transaction = new Transaction(transactionData);
  transaction.calculateTokenValue();

  // Save the transaction
  await transaction.save();

  // Adjust the user's balance
  await Balance.findOneAndUpdate(
    { user: transaction.user },
    { $inc: { tokens: transaction.tokenValue } },
    { upsert: true, new: true },
  );
};

module.exports = mongoose.model('Transaction', transactionSchema);
