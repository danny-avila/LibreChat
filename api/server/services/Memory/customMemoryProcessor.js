/**
 * Custom Memory Processor for Vicktoria/RunPod endpoint
 * Simple memory storage and retrieval system
 */

const { logger } = require('@librechat/data-schemas');

/**
 * Process and save conversation to memory buffer
 * This stores the raw conversation for context
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {string} params.conversationText - Current conversation text
 * @param {Object} params.memoryConfig - Memory configuration from yaml
 * @param {Object} params.endpointConfig - Endpoint configuration
 * @param {Object} params.memoryMethods - Memory database methods
 */
async function processCustomMemory({
  userId,
  conversationText,
  memoryConfig,
  endpointConfig,
  memoryMethods,
}) {
  try {
    logger.info(`[CustomMemory] Processing memory for user ${userId}`);
    logger.info(`[CustomMemory] Conversation text length: ${conversationText?.length || 0}`);

    if (!conversationText || conversationText.trim().length === 0) {
      logger.debug('[CustomMemory] No conversation text to process');
      return;
    }

    // Get existing conversation context
    let existingContext = '';
    try {
      const allMemories = await memoryMethods.getAllUserMemories(userId);
      const contextMemory = allMemories?.find(m => m.key === 'conversation_context');
      existingContext = contextMemory?.value || '';
    } catch (e) {
      logger.debug('[CustomMemory] No existing context found');
    }

    // Append new conversation to context (keep last ~2000 chars to avoid overflow)
    const separator = existingContext ? '\n---\n' : '';
    let updatedContext = existingContext + separator + conversationText;

    // Trim to keep manageable size (roughly 2000 chars max)
    if (updatedContext.length > 2500) {
      updatedContext = updatedContext.slice(-2000);
      // Find first complete line
      const firstNewline = updatedContext.indexOf('\n');
      if (firstNewline > 0) {
        updatedContext = updatedContext.slice(firstNewline + 1);
      }
    }

    // Save updated conversation context
    await memoryMethods.setMemory({
      userId,
      key: 'conversation_context',
      value: updatedContext,
      tokenCount: Math.ceil(updatedContext.split(/\s+/).length * 1.3),
    });

    logger.info(`[CustomMemory] Saved conversation context for user ${userId} (${updatedContext.length} chars)`);

    // Also extract key facts using simple pattern matching
    await extractAndSaveKeyFacts({ userId, conversationText, memoryMethods });

  } catch (error) {
    logger.error('[CustomMemory] Error processing memory:', error.message);
  }
}

/**
 * Extract key facts from conversation using simple patterns
 * @param {Object} params
 */
async function extractAndSaveKeyFacts({ userId, conversationText, memoryMethods }) {
  try {
    const text = conversationText.toLowerCase();

    // Pattern matching for common personal info
    const patterns = [
      {
        regex: /(?:my name is|i'm|i am|call me)\s+([a-z]+)/i,
        key: 'personal_information',
        format: (match) => `User's name is ${match[1]}`
      },
      {
        regex: /(?:i live in|i'm from|i am from|living in)\s+([a-z\s]+?)(?:\.|,|$)/i,
        key: 'personal_information',
        format: (match) => `User lives in/from ${match[1].trim()}`
      },
      {
        regex: /(?:i work at|i work for|working at|working for)\s+([a-z\s]+?)(?:\.|,|$)/i,
        key: 'learned_facts',
        format: (match) => `User works at ${match[1].trim()}`
      },
      {
        regex: /(?:i am a|i'm a|i work as|my job is)\s+([a-z\s]+?)(?:\.|,|$)/i,
        key: 'learned_facts',
        format: (match) => `User's profession: ${match[1].trim()}`
      },
      {
        regex: /(?:i like|i love|i enjoy|my favorite)\s+([a-z\s]+?)(?:\.|,|$)/i,
        key: 'user_preferences',
        format: (match) => `User likes ${match[1].trim()}`
      }
    ];

    for (const pattern of patterns) {
      const match = conversationText.match(pattern.regex);
      if (match) {
        const value = pattern.format(match);

        // Get existing value for this key
        let existingValue = '';
        try {
          const allMemories = await memoryMethods.getAllUserMemories(userId);
          const existing = allMemories?.find(m => m.key === pattern.key);
          existingValue = existing?.value || '';
        } catch (e) {
          // ignore
        }

        // Don't duplicate if already saved
        if (!existingValue.toLowerCase().includes(value.toLowerCase().slice(0, 20))) {
          const newValue = existingValue ? `${existingValue}; ${value}` : value;

          await memoryMethods.setMemory({
            userId,
            key: pattern.key,
            value: newValue.slice(0, 500), // Limit length
            tokenCount: Math.ceil(newValue.split(/\s+/).length * 1.3),
          });

          logger.info(`[CustomMemory] Saved fact: ${pattern.key} = ${value}`);
        }
      }
    }
  } catch (error) {
    logger.debug('[CustomMemory] Error extracting facts:', error.message);
  }
}

/**
 * Get formatted memories for injection into conversation context
 * @param {Object} params
 * @param {string} params.userId - User ID
 * @param {Object} params.memoryMethods - Memory database methods
 * @returns {Promise<string>}
 */
async function getMemoryContext({ userId, memoryMethods }) {
  try {
    logger.info(`[CustomMemory] Getting memory context for user ${userId}`);

    // Get all memories for user
    const allMemories = await memoryMethods.getAllUserMemories(userId);

    if (!allMemories || allMemories.length === 0) {
      logger.info(`[CustomMemory] No memories found for user ${userId}`);
      return '';
    }

    logger.info(`[CustomMemory] Found ${allMemories.length} memories for user ${userId}`);

    // Format memories for context injection
    const memoryParts = [];

    // Priority order: personal_information, learned_facts, user_preferences, conversation_context
    const priorityKeys = ['personal_information', 'learned_facts', 'user_preferences', 'conversation_context'];

    for (const key of priorityKeys) {
      const memory = allMemories.find(m => m.key === key);
      if (memory?.value) {
        memoryParts.push(`[${key}]: ${memory.value}`);
      }
    }

    // Also include any other memories
    for (const memory of allMemories) {
      if (!priorityKeys.includes(memory.key) && memory.value) {
        memoryParts.push(`[${memory.key}]: ${memory.value}`);
      }
    }

    if (memoryParts.length === 0) {
      return '';
    }

    const result = memoryParts.join('\n');
    logger.info(`[CustomMemory] Returning memory context (${result.length} chars)`);
    return result;
  } catch (error) {
    logger.error('[CustomMemory] Error getting memory context:', error.message);
    return '';
  }
}

module.exports = {
  processCustomMemory,
  getMemoryContext,
};
