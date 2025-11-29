const { Transaction } = require('~/db/models');
const { logger } = require('@librechat/data-schemas');

/**
 * Get platform usage statistics
 * @route GET /api/admin/stats
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Object} Statistics including total transactions and token usage
 */
const getStats = async (req, res) => {
    try {
        const totalTransactions = await Transaction.countDocuments();

        // Aggregate token usage
        const tokenStats = await Transaction.aggregate([
            {
                $group: {
                    _id: null,
                    totalTokens: { $sum: '$tokenValue' }, // Assuming tokenValue represents the cost/tokens
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({
            totalTransactions,
            tokenStats: tokenStats[0] || { totalTokens: 0, count: 0 },
        });
    } catch (error) {
        logger.error('Error getting stats:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

module.exports = {
    getStats,
};
