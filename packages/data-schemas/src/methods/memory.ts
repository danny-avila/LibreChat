import { Types } from 'mongoose';
import logger from '~/config/winston';
import type * as t from '~/types';

/**
 * Formats a date in YYYY-MM-DD format
 */
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Factory function that takes mongoose instance and returns the methods
export function createMemoryMethods(mongoose: typeof import('mongoose')) {
  const MemoryEntry = mongoose.models.MemoryEntry;

  /**
   * Creates a new memory entry for a user
   * Throws an error if a memory with the same key already exists
   */
  async function createMemory({
    userId,
    key,
    value,
    tokenCount = 0,
  }: t.SetMemoryParams): Promise<t.MemoryResult> {
    try {
      if (key?.toLowerCase() === 'nothing') {
        return { ok: false };
      }

      const existingMemory = await MemoryEntry.findOne({ userId, key });
      if (existingMemory) {
        throw new Error('Memory with this key already exists');
      }

      await MemoryEntry.create({
        userId,
        key,
        value,
        tokenCount,
        updated_at: new Date(),
      });

      return { ok: true };
    } catch (error) {
      throw new Error(
        `Failed to create memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Sets or updates a memory entry for a user
   */
  async function setMemory({
    userId,
    key,
    value,
    tokenCount = 0,
  }: t.SetMemoryParams): Promise<t.MemoryResult> {
    try {
      if (key?.toLowerCase() === 'nothing') {
        return { ok: false };
      }

      await MemoryEntry.findOneAndUpdate(
        { userId, key },
        {
          value,
          tokenCount,
          updated_at: new Date(),
        },
        {
          upsert: true,
          new: true,
        },
      );

      return { ok: true };
    } catch (error) {
      throw new Error(
        `Failed to set memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Deletes a specific memory entry for a user
   */
  async function deleteMemory({ userId, key }: t.DeleteMemoryParams): Promise<t.MemoryResult> {
    try {
      const result = await MemoryEntry.findOneAndDelete({ userId, key });
      return { ok: !!result };
    } catch (error) {
      throw new Error(
        `Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets all memory entries for a user
   */
  async function getAllUserMemories(
    userId: string | Types.ObjectId,
  ): Promise<t.IMemoryEntryLean[]> {
    try {
      return (await MemoryEntry.find({ userId }).lean()) as t.IMemoryEntryLean[];
    } catch (error) {
      throw new Error(
        `Failed to get all memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets and formats all memories for a user in two different formats
   */
  async function getFormattedMemories({
    userId,
  }: t.GetFormattedMemoriesParams): Promise<t.FormattedMemoriesResult> {
    try {
      const memories = await getAllUserMemories(userId);

      if (!memories || memories.length === 0) {
        return { withKeys: '', withoutKeys: '', totalTokens: 0 };
      }

      const sortedMemories = memories.sort(
        (a, b) => new Date(a.updated_at!).getTime() - new Date(b.updated_at!).getTime(),
      );

      const totalTokens = sortedMemories.reduce((sum, memory) => {
        return sum + (memory.tokenCount || 0);
      }, 0);

      const withKeys = sortedMemories
        .map((memory, index) => {
          const date = formatDate(new Date(memory.updated_at!));
          const tokenInfo = memory.tokenCount ? ` [${memory.tokenCount} tokens]` : '';
          return `${index + 1}. [${date}]. ["key": "${memory.key}"]${tokenInfo}. ["value": "${memory.value}"]`;
        })
        .join('\n\n');

      const withoutKeys = sortedMemories
        .map((memory, index) => {
          const date = formatDate(new Date(memory.updated_at!));
          return `${index + 1}. [${date}]. ${memory.value}`;
        })
        .join('\n\n');

      return { withKeys, withoutKeys, totalTokens };
    } catch (error) {
      logger.error('Failed to get formatted memories:', error);
      return { withKeys: '', withoutKeys: '', totalTokens: 0 };
    }
  }

  return {
    setMemory,
    createMemory,
    deleteMemory,
    getAllUserMemories,
    getFormattedMemories,
  };
}

export type MemoryMethods = ReturnType<typeof createMemoryMethods>;
