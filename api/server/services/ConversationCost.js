const { Transaction } = require('~/db/models');
const { calculateTokenCost, getModelProvider } = require('./ModelPricing');
const { logger } = require('~/config');

/**
 * Calculate the total cost of a conversation
 * @param {string} conversationId - The conversation ID
 * @param {string} [userId] - Optional user ID for filtering
 * @returns {Promise<Object|null>} Cost summary or null if no transactions found
 */
async function calculateConversationCost(conversationId, userId = null) {
  try {
    // Build query
    const query = { conversationId };
    if (userId) {
      query.user = userId;
    }

    // Get all transactions for this conversation
    const transactions = await Transaction.find(query)
      .sort({ createdAt: 1 })
      .lean();

    if (!transactions || transactions.length === 0) {
      return null;
    }

    // Initialize cost tracking
    const costBreakdown = {
      prompt: 0,
      completion: 0,
      cacheWrite: 0,
      cacheRead: 0,
      reasoning: 0,
    };

    const tokenUsage = {
      promptTokens: 0,
      completionTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      reasoningTokens: 0,
    };

    const modelBreakdown = new Map();
    let lastUpdated = new Date(0);

    // Process each transaction
    for (const transaction of transactions) {
      const transactionDate = new Date(transaction.createdAt);
      if (transactionDate > lastUpdated) {
        lastUpdated = transactionDate;
      }

      const model = transaction.model;
      if (!model) {
        logger.warn(`Transaction ${transaction._id} has no model specified`);
        continue;
      }

      // Initialize model breakdown if not exists
      if (!modelBreakdown.has(model)) {
        modelBreakdown.set(model, {
          model,
          provider: getModelProvider(model),
          cost: 0,
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            reasoningTokens: 0,
          },
          transactionCount: 0,
        });
      }

      const modelData = modelBreakdown.get(model);
      modelData.transactionCount++;

      // Extract token counts based on transaction type
      let currentTokenUsage = {};
      const rawAmount = Math.abs(transaction.rawAmount || 0);

      if (transaction.tokenType === 'prompt') {
        // Check if this is a structured transaction with cache tokens
        if (transaction.inputTokens !== undefined) {
          currentTokenUsage.promptTokens = Math.abs(transaction.inputTokens || 0);
          currentTokenUsage.cacheWriteTokens = Math.abs(transaction.writeTokens || 0);
          currentTokenUsage.cacheReadTokens = Math.abs(transaction.readTokens || 0);
        } else {
          currentTokenUsage.promptTokens = rawAmount;
        }
      } else if (transaction.tokenType === 'completion') {
        currentTokenUsage.completionTokens = rawAmount;
      } else if (transaction.tokenType === 'reasoning') {
        currentTokenUsage.reasoningTokens = rawAmount;
      }

      // Calculate cost using historical pricing
      const cost = calculateTokenCost(model, currentTokenUsage, transactionDate);
      
      if (!cost.error) {
        // Add to overall breakdown
        costBreakdown.prompt += cost.prompt;
        costBreakdown.completion += cost.completion;
        costBreakdown.cacheWrite += cost.cacheWrite;
        costBreakdown.cacheRead += cost.cacheRead;
        costBreakdown.reasoning += cost.reasoning;

        // Add to model breakdown
        modelData.cost += cost.total;
        
        // Update token usage
        for (const [key, value] of Object.entries(currentTokenUsage)) {
          modelData.tokenUsage[key] += value;
          tokenUsage[key] += value;
        }
      } else {
        logger.warn(`Could not calculate cost for model ${model}: ${cost.error}`);
        // Fallback: use the tokenValue from transaction if available
        const fallbackCost = Math.abs(transaction.tokenValue || 0) / 1000000;
        const costType = transaction.tokenType === 'completion' ? 'completion' : 'prompt';
        costBreakdown[costType] += fallbackCost;
        modelData.cost += fallbackCost;
      }
    }

    // Calculate total cost
    const totalCost = Object.values(costBreakdown).reduce((sum, cost) => sum + cost, 0);

    // Convert model breakdown to array
    const modelBreakdownArray = Array.from(modelBreakdown.values())
      .sort((a, b) => b.cost - a.cost);

    return {
      conversationId,
      totalCost: Math.round(totalCost * 100000) / 100000, // Round to 5 decimal places
      costBreakdown: {
        prompt: Math.round(costBreakdown.prompt * 100000) / 100000,
        completion: Math.round(costBreakdown.completion * 100000) / 100000,
        cacheWrite: Math.round(costBreakdown.cacheWrite * 100000) / 100000,
        cacheRead: Math.round(costBreakdown.cacheRead * 100000) / 100000,
        reasoning: Math.round(costBreakdown.reasoning * 100000) / 100000,
      },
      tokenUsage,
      modelBreakdown: modelBreakdownArray,
      lastUpdated,
    };
  } catch (error) {
    logger.error('Error calculating conversation cost:', error);
    throw error;
  }
}

/**
 * Get simplified cost display for UI
 * @param {string} conversationId - The conversation ID
 * @param {string} [userId] - Optional user ID
 * @returns {Promise<Object|null>} Simplified cost data for UI display
 */
async function getConversationCostDisplay(conversationId, userId = null) {
  try {
    const costSummary = await calculateConversationCost(conversationId, userId);
    if (!costSummary) {
      return null;
    }

    // Format cost for display
    const formatCost = (cost) => {
      if (cost < 0.001) {
        return '<$0.001';
      }
      if (cost < 0.01) {
        return `$${cost.toFixed(4)}`;
      }
      if (cost < 1) {
        return `$${cost.toFixed(3)}`;
      }
      return `$${cost.toFixed(2)}`;
    };

    return {
      conversationId,
      totalCost: formatCost(costSummary.totalCost),
      totalCostRaw: costSummary.totalCost,
      primaryModel: costSummary.modelBreakdown[0]?.model || 'Unknown',
      totalTokens: costSummary.tokenUsage.promptTokens + costSummary.tokenUsage.completionTokens,
      lastUpdated: costSummary.lastUpdated,
    };
  } catch (error) {
    logger.error('Error getting conversation cost display:', error);
    return null;
  }
}

/**
 * Calculate costs for multiple conversations
 * @param {string[]} conversationIds - Array of conversation IDs
 * @param {string} [userId] - Optional user ID
 * @returns {Promise<Object>} Map of conversation IDs to cost displays
 */
async function getMultipleConversationCosts(conversationIds, userId = null) {
  try {
    const results = {};
    
    // Process in batches to avoid overwhelming the database
    const batchSize = 10;
    for (let i = 0; i < conversationIds.length; i += batchSize) {
      const batch = conversationIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (conversationId) => {
        try {
          const cost = await getConversationCostDisplay(conversationId, userId);
          return { conversationId, cost };
        } catch (error) {
          logger.error(`Error calculating cost for conversation ${conversationId}:`, error);
          return { conversationId, cost: null };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ conversationId, cost }) => {
        results[conversationId] = cost;
      });
    }

    return results;
  } catch (error) {
    logger.error('Error calculating multiple conversation costs:', error);
    throw error;
  }
}

module.exports = {
  calculateConversationCost,
  getConversationCostDisplay,
  getMultipleConversationCosts,
};