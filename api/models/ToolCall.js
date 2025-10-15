const { ToolCall } = require('~/db/models');

/**
 * Create a new tool call
 * @param {IToolCallData} toolCallData - The tool call data
 * @returns {Promise<IToolCallData>} The created tool call document
 */
async function createToolCall(toolCallData) {
  try {
    return await ToolCall.create(toolCallData);
  } catch (error) {
    throw new Error(`Error creating tool call: ${error.message}`);
  }
}

/**
 * Get a tool call by ID
 * @param {string} id - The tool call document ID
 * @returns {Promise<IToolCallData|null>} The tool call document or null if not found
 */
async function getToolCallById(id) {
  try {
    return await ToolCall.findById(id).lean();
  } catch (error) {
    throw new Error(`Error fetching tool call: ${error.message}`);
  }
}

/**
 * Get tool calls by message ID and user
 * @param {string} messageId - The message ID
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<Array>} Array of tool call documents
 */
async function getToolCallsByMessage(messageId, userId) {
  try {
    return await ToolCall.find({ messageId, user: userId }).lean();
  } catch (error) {
    throw new Error(`Error fetching tool calls: ${error.message}`);
  }
}

/**
 * Get tool calls by conversation ID and user
 * @param {string} conversationId - The conversation ID
 * @param {string} userId - The user's ObjectId
 * @returns {Promise<IToolCallData[]>} Array of tool call documents
 */
async function getToolCallsByConvo(conversationId, userId) {
  try {
    return await ToolCall.find({ conversationId, user: userId }).lean();
  } catch (error) {
    throw new Error(`Error fetching tool calls: ${error.message}`);
  }
}

/**
 * Update a tool call
 * @param {string} id - The tool call document ID
 * @param {Partial<IToolCallData>} updateData - The data to update
 * @returns {Promise<IToolCallData|null>} The updated tool call document or null if not found
 */
async function updateToolCall(id, updateData) {
  try {
    return await ToolCall.findByIdAndUpdate(id, updateData, { new: true }).lean();
  } catch (error) {
    throw new Error(`Error updating tool call: ${error.message}`);
  }
}

/**
 * Delete a tool call
 * @param {string} userId - The related user's ObjectId
 * @param {string} [conversationId] - The tool call conversation ID
 * @returns {Promise<{ ok?: number; n?: number; deletedCount?: number }>} The result of the delete operation
 */
async function deleteToolCalls(userId, conversationId) {
  try {
    const query = { user: userId };
    if (conversationId) {
      query.conversationId = conversationId;
    }
    return await ToolCall.deleteMany(query);
  } catch (error) {
    throw new Error(`Error deleting tool call: ${error.message}`);
  }
}

module.exports = {
  createToolCall,
  updateToolCall,
  deleteToolCalls,
  getToolCallById,
  getToolCallsByConvo,
  getToolCallsByMessage,
};
