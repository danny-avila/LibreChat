const { calculateTokenCost, getModelProvider } = require('./ModelPricing');
const { logger } = require('~/config');

/**
 * Calculate the total cost of a conversation from messages
 * @param {Array<Object>} messages - Array of message objects from the database
 * @param {string} messages[].messageId - Unique identifier for the message
 * @param {string|null} messages[].model - The model used (null for user messages)
 * @param {number} messages[].tokenCount - Token count for the message
 * @param {Object} [messages[].usage] - OpenAI-style usage object
 * @param {Object} [messages[].tokens] - Alternative token format
 * @param {Date} messages[].createdAt - When the message was created
 * @returns {Object|null} Cost summary with total cost, breakdown, and model details
 * @returns {number} returns.totalCost - Total cost across all models
 * @returns {Object} returns.costBreakdown - Breakdown by token type
 * @returns {Object} returns.tokenUsage - Token counts by type
 * @returns {Array} returns.modelBreakdown - Per-model cost and usage
 * @returns {Date} returns.lastUpdated - Timestamp of the last message
 */
function calculateConversationCostFromMessages(messages) {
  try {
    if (!messages || messages.length === 0) {
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

    // Process each message
    messages.forEach((message) => {
      // Debug each message processing
      const hasTokenInfo = !!(message.tokenCount || message.tokens || message.usage);
      const inferredRole = message.model ? 'assistant' : 'user';

      // For LibreChat: Skip messages without token info, but allow both user and assistant messages
      // User messages have model=null, assistant messages have specific models
      if (!hasTokenInfo) {
        return;
      }

      // For assistant messages, we need a model for pricing
      if (inferredRole === 'assistant' && !message.model) {
        return;
      }

      const messageDate = new Date(message.createdAt || message.timestamp || Date.now());
      if (messageDate > lastUpdated) {
        lastUpdated = messageDate;
      }

      // For user messages, use a special key since they don't have a model
      const modelKey = message.model || 'user-input';

      // Initialize model breakdown if not exists
      if (!modelBreakdown.has(modelKey)) {
        modelBreakdown.set(modelKey, {
          model: modelKey,
          provider: message.model ? getModelProvider(message.model) : 'user',
          cost: 0,
          tokenUsage: {
            promptTokens: 0,
            completionTokens: 0,
            cacheWriteTokens: 0,
            cacheReadTokens: 0,
            reasoningTokens: 0,
          },
          messageCount: 0,
        });
      }

      const modelData = modelBreakdown.get(modelKey);
      modelData.messageCount++;

      // Extract token counts from message
      let currentTokenUsage = {};

      // Check different possible token count formats
      if (message.usage) {
        // OpenAI format: { prompt_tokens, completion_tokens }
        currentTokenUsage.promptTokens = message.usage.prompt_tokens || 0;
        currentTokenUsage.completionTokens = message.usage.completion_tokens || 0;
        currentTokenUsage.reasoningTokens = message.usage.reasoning_tokens || 0;
      } else if (message.tokens) {
        // Alternative format
        currentTokenUsage.promptTokens = message.tokens.prompt || message.tokens.input || 0;
        currentTokenUsage.completionTokens =
          message.tokens.completion || message.tokens.output || 0;
      } else if (message.tokenCount) {
        // LibreChat format: simple tokenCount field
        // Infer role from model field: null model = user message, specific model = assistant message
        const inferredRole = message.model ? 'assistant' : 'user';

        if (inferredRole === 'assistant') {
          currentTokenUsage.completionTokens = message.tokenCount;
        } else {
          currentTokenUsage.promptTokens = message.tokenCount;
        }
      }

      // Handle cache tokens if present
      if (message.cacheTokens) {
        currentTokenUsage.cacheWriteTokens = message.cacheTokens.write || 0;
        currentTokenUsage.cacheReadTokens = message.cacheTokens.read || 0;
      }

      // Calculate cost using historical pricing (only for assistant messages with models)
      if (message.model) {
        const cost = calculateTokenCost(message.model, currentTokenUsage, messageDate);

        if (!cost.error) {
          // Add to overall breakdown
          costBreakdown.prompt += cost.prompt;
          costBreakdown.completion += cost.completion;
          costBreakdown.cacheWrite += cost.cacheWrite;
          costBreakdown.cacheRead += cost.cacheRead;
          costBreakdown.reasoning += cost.reasoning;

          // Add to model breakdown
          modelData.cost += cost.total;
        } else {
          logger.warn(`Could not calculate cost for model ${message.model}: ${cost.error}`);
        }
      }

      // Always update token usage (for both user and assistant messages)
      for (const [key, value] of Object.entries(currentTokenUsage)) {
        modelData.tokenUsage[key] += value;
        tokenUsage[key] += value;
      }
    });

    // Calculate total cost
    const totalCost = Object.values(costBreakdown).reduce((sum, cost) => sum + cost, 0);

    // Convert model breakdown to array
    const modelBreakdownArray = Array.from(modelBreakdown.values()).sort((a, b) => b.cost - a.cost);

    return {
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
    logger.error('Error calculating conversation cost from messages:', error);
    return null;
  }
}

/**
 * Get simplified cost display for UI from messages
 * @param {Array<Object>} messages - Array of message objects from the database
 * @returns {Object|null} Simplified cost data for UI display
 * @returns {string} returns.totalCost - Formatted cost string (e.g., "$0.054")
 * @returns {number} returns.totalCostRaw - Raw cost value for calculations
 * @returns {string} returns.primaryModel - The model that contributed most to cost
 * @returns {number} returns.totalTokens - Total token count across all messages
 * @returns {Date} returns.lastUpdated - Timestamp of the last message
 */
function getConversationCostDisplayFromMessages(messages) {
  try {
    if (!messages || messages.length === 0) {
      return null;
    }

    const costSummary = calculateConversationCostFromMessages(messages);
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
      totalCost: formatCost(costSummary.totalCost),
      totalCostRaw: costSummary.totalCost,
      primaryModel: costSummary.modelBreakdown[0]?.model || 'Unknown',
      totalTokens: costSummary.tokenUsage.promptTokens + costSummary.tokenUsage.completionTokens,
      lastUpdated: costSummary.lastUpdated,
    };
  } catch (error) {
    logger.error('Error getting conversation cost display from messages:', error);
    return null;
  }
}

/**
 * Get costs for multiple conversations in batch
 * @param {string[]} conversationIds - Array of conversation IDs
 * @param {string} userId - User ID
 * @returns {Object} Map of conversationId to cost display data
 */
async function getMultipleConversationCosts(conversationIds, userId) {
  try {
    const { getMessages } = require('~/models/Message');
    const results = {};

    // Process in batches to avoid overwhelming the database
    const batchSize = 10;
    for (let i = 0; i < conversationIds.length; i += batchSize) {
      const batch = conversationIds.slice(i, i + batchSize);
      
      // Process batch in parallel
      await Promise.all(
        batch.map(async (conversationId) => {
          try {
            const messages = await getMessages({
              user: userId,
              conversationId: conversationId,
            });

            if (messages && messages.length > 0) {
              const costDisplay = getConversationCostDisplayFromMessages(messages);
              if (costDisplay) {
                costDisplay.conversationId = conversationId;
                results[conversationId] = costDisplay;
              } else {
                results[conversationId] = null;
              }
            } else {
              results[conversationId] = null;
            }
          } catch (error) {
            logger.error(`Error calculating cost for conversation ${conversationId}:`, error);
            results[conversationId] = null;
          }
        })
      );
    }

    return results;
  } catch (error) {
    logger.error('Error getting multiple conversation costs:', error);
    return {};
  }
}

module.exports = {
  calculateConversationCostFromMessages,
  getConversationCostDisplayFromMessages,
  getMultipleConversationCosts,
};
