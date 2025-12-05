/**
 * Custom Memory Processor
 * Simple LLM-based summarization - stores plain text understanding of the user
 */

const { logger } = require('@librechat/data-schemas');

/** Key used to store the user summary */
const USER_SUMMARY_KEY = 'user_summary';

/**
 * Process conversation and update user summary
 * @param {Object} params
 */
async function processCustomMemory({
  userId,
  conversationText,
  memoryConfig,
  endpointConfig,
  memoryMethods,
}) {
  try {
    logger.info(`[Memory] processCustomMemory called for user ${userId}`);
    logger.info(`[Memory] conversationText length: ${conversationText?.length || 0}`);

    if (!conversationText || conversationText.trim().length < 30) {
      logger.info('[Memory] Skipping - conversation too short');
      return;
    }

    // Get existing summary
    const existingSummary = await getExistingSummary(userId, memoryMethods);
    logger.info(`[Memory] Existing summary length: ${existingSummary?.length || 0}`);

    // Ask LLM to update the summary based on new conversation
    logger.info(`[Memory] Calling LLM to update summary...`);
    const updatedSummary = await updateSummaryWithLLM({
      existingSummary,
      conversationText,
      endpointConfig,
    });

    logger.info(
      `[Memory] LLM returned summary: ${updatedSummary ? updatedSummary.length + ' chars' : 'null'}`,
    );

    if (!updatedSummary) {
      logger.info('[Memory] No updated summary from LLM, skipping save');
      return;
    }

    // Save updated summary
    await memoryMethods.setMemory({
      userId,
      key: USER_SUMMARY_KEY,
      value: updatedSummary,
      tokenCount: Math.ceil(updatedSummary.split(/\s+/).length * 1.3),
    });

    logger.info(`[Memory] Updated user summary (${updatedSummary.length} chars)`);
  } catch (error) {
    logger.error('[Memory] Error processing memory:', error.message);
  }
}

/**
 * Get existing user summary
 */
async function getExistingSummary(userId, memoryMethods) {
  try {
    const memories = await memoryMethods.getAllUserMemories(userId);
    const summary = memories?.find((m) => m.key === USER_SUMMARY_KEY);
    return summary?.value || '';
  } catch (error) {
    return '';
  }
}

/**
 * Call LLM to update user summary based on conversation
 */
async function updateSummaryWithLLM({ existingSummary, conversationText, endpointConfig }) {
  try {
    const baseURL = endpointConfig.baseURL;
    const apiKey = endpointConfig.apiKey || 'not-needed';
    // models can be an array or an object with 'default' array
    // each model can be a string or an object with 'name' property
    const modelsArray = Array.isArray(endpointConfig.models)
      ? endpointConfig.models
      : endpointConfig.models?.default;
    const firstModel = modelsArray?.[0];
    const model = typeof firstModel === 'string' ? firstModel : firstModel?.name || 'default';

    logger.info(`[Memory] LLM call - baseURL: ${baseURL}, model: ${model}`);

    const systemPrompt = existingSummary
      ? `You have this existing understanding of the user:
---
${existingSummary}
---

Based on the new conversation below, update this summary. Add any new facts learned about who they are, their personality, preferences, life situation, or anything meaningful. Remove nothing unless it was wrong. Keep it concise - just the essential understanding. Write in third person.`
      : `Based on this conversation, write a brief summary of what you learned about this user. Include facts about who they are, their personality, preferences, life situation - anything meaningful. Keep it concise. Write in third person.`;

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationText },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[Memory] LLM call failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    logger.info(`[Memory] LLM response data keys: ${Object.keys(data).join(', ')}`);
    const content = data.choices?.[0]?.message?.content?.trim();
    logger.info(`[Memory] LLM content: ${content ? content.substring(0, 100) + '...' : 'null'}`);

    if (!content || content.toLowerCase().includes('no new information') || content.length < 10) {
      logger.info(`[Memory] Content rejected - empty or 'no new information'`);
      return null;
    }

    // Limit summary length
    return content.slice(0, 1500);
  } catch (error) {
    logger.error('[Memory] LLM error:', error.message);
    return null;
  }
}

/**
 * Get memory context for injection into conversation
 */
async function getMemoryContext({ userId, memoryMethods }) {
  try {
    const memories = await memoryMethods.getAllUserMemories(userId);

    if (!memories || memories.length === 0) {
      return '';
    }

    // Get the main user summary
    const summary = memories.find((m) => m.key === USER_SUMMARY_KEY);

    if (summary?.value) {
      return summary.value;
    }

    // Fallback: combine any other memories
    const parts = memories
      .filter((m) => m.key !== 'conversation_context' && m.value)
      .map((m) => m.value);

    return parts.join(' ');
  } catch (error) {
    logger.error('[Memory] Error getting context:', error.message);
    return '';
  }
}

module.exports = {
  processCustomMemory,
  getMemoryContext,
  USER_SUMMARY_KEY,
};
