const mongoose = require('mongoose');
const imageTransactionSchema = require('./schema/imageTransaction');
const { logger } = require('~/config');

/**
 * Creates a new image transaction record if tracking is enabled
 * @param {Object} txData Transaction data including user, prompt, endpoint, cost, etc.
 * @returns {Promise<Object|null>} Created transaction record or null if tracking is disabled
 */
imageTransactionSchema.statics.create = async function(txData) {
  // Check if image transaction tracking is enabled (defaults to false if not set)
  const trackTransactions = process.env.TRACK_IMAGE_TRANSACTIONS === 'true';
  if (!trackTransactions) {
    logger.debug('[ImageTransaction] Image transaction tracking is disabled');
    return null;
  }

  const ImageTransaction = this;
  
  // Allow cost of 0 for error transactions, but validate cost for success transactions
  if ((txData.status === 'success' && !txData.cost) || isNaN(txData.cost)) {
    logger.error('[ImageTransaction] Invalid cost value:', txData.cost);
    throw new Error('Invalid cost value for image transaction');
  }

  const transaction = new ImageTransaction(txData);
  return await transaction.save();
};

/**
 * Retrieves image transactions based on filter criteria if tracking is enabled
 * @param {Object} filter MongoDB filter object
 * @returns {Promise<Array>} Array of matching transactions or empty array if tracking is disabled
 */
async function getImageTransactions(filter) {
  // Check if image transaction tracking is enabled (defaults to false if not set)
  const trackTransactions = process.env.TRACK_IMAGE_TRANSACTIONS === 'true';
  if (!trackTransactions) {
    logger.debug('[ImageTransaction] Image transaction tracking is disabled');
    return [];
  }

  try {
    return await ImageTransaction.find(filter).lean();
  } catch (error) {
    logger.error('[ImageTransaction] Error querying transactions:', error);
    throw error;
  }
}

const ImageTransaction = mongoose.model('ImageTransaction', imageTransactionSchema);

module.exports = { ImageTransaction, getImageTransactions }; 