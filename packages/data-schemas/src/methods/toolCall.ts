import type { Model } from 'mongoose';

interface IToolCallData {
  messageId?: string;
  conversationId?: string;
  user?: string;
  [key: string]: unknown;
}

export function createToolCallMethods(mongoose: typeof import('mongoose')) {
  /**
   * Create a new tool call
   */
  async function createToolCall(toolCallData: IToolCallData) {
    try {
      const ToolCall = mongoose.models.ToolCall as Model<IToolCallData>;
      return await ToolCall.create(toolCallData);
    } catch (error) {
      throw new Error(`Error creating tool call: ${(error as Error).message}`);
    }
  }

  /**
   * Get a tool call by ID
   */
  async function getToolCallById(id: string) {
    try {
      const ToolCall = mongoose.models.ToolCall as Model<IToolCallData>;
      return await ToolCall.findById(id).lean();
    } catch (error) {
      throw new Error(`Error fetching tool call: ${(error as Error).message}`);
    }
  }

  /**
   * Get tool calls by message ID and user
   */
  async function getToolCallsByMessage(messageId: string, userId: string) {
    try {
      const ToolCall = mongoose.models.ToolCall as Model<IToolCallData>;
      return await ToolCall.find({ messageId, user: userId }).lean();
    } catch (error) {
      throw new Error(`Error fetching tool calls: ${(error as Error).message}`);
    }
  }

  /**
   * Get tool calls by conversation ID and user
   */
  async function getToolCallsByConvo(conversationId: string, userId: string) {
    try {
      const ToolCall = mongoose.models.ToolCall as Model<IToolCallData>;
      return await ToolCall.find({ conversationId, user: userId }).lean();
    } catch (error) {
      throw new Error(`Error fetching tool calls: ${(error as Error).message}`);
    }
  }

  /**
   * Update a tool call
   */
  async function updateToolCall(id: string, updateData: Partial<IToolCallData>) {
    try {
      const ToolCall = mongoose.models.ToolCall as Model<IToolCallData>;
      return await ToolCall.findByIdAndUpdate(id, updateData, { new: true }).lean();
    } catch (error) {
      throw new Error(`Error updating tool call: ${(error as Error).message}`);
    }
  }

  /**
   * Delete tool calls by user and optionally conversation
   */
  async function deleteToolCalls(userId: string, conversationId?: string) {
    try {
      const ToolCall = mongoose.models.ToolCall as Model<IToolCallData>;
      const query: Record<string, string> = { user: userId };
      if (conversationId) {
        query.conversationId = conversationId;
      }
      return await ToolCall.deleteMany(query);
    } catch (error) {
      throw new Error(`Error deleting tool call: ${(error as Error).message}`);
    }
  }

  return {
    createToolCall,
    updateToolCall,
    deleteToolCalls,
    getToolCallById,
    getToolCallsByConvo,
    getToolCallsByMessage,
  };
}

export type ToolCallMethods = ReturnType<typeof createToolCallMethods>;
