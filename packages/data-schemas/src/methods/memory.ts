import { Types } from 'mongoose';
import logger from '~/config/winston';
import type * as t from '~/types';
import type { IUserProfileLean } from '~/types/userProfile';

/**
 * Profile categories for formatting
 */
const PROFILE_CATEGORIES = [
  'identity',
  'personality',
  'values',
  'goals',
  'interests',
  'relationships',
  'emotional',
  'communication',
  'thinking',
  'daily_life',
  'current_context',
  'self_perception',
  'boundaries',
  'history',
  'meta_behavior',
] as const;

/**
 * Formats a date in YYYY-MM-DD format
 */
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Factory function that takes mongoose instance and returns the methods
export function createMemoryMethods(mongoose: typeof import('mongoose')) {
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

      const MemoryEntry = mongoose.models.MemoryEntry;
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

      const MemoryEntry = mongoose.models.MemoryEntry;
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
      const MemoryEntry = mongoose.models.MemoryEntry;
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
      const MemoryEntry = mongoose.models.MemoryEntry;
      return (await MemoryEntry.find({ userId }).lean()) as t.IMemoryEntryLean[];
    } catch (error) {
      throw new Error(
        `Failed to get all memories: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets user profile data
   */
  async function getUserProfile(userId: string | Types.ObjectId): Promise<IUserProfileLean | null> {
    try {
      const UserProfile = mongoose.models.UserProfile;
      if (!UserProfile) {
        return null;
      }
      return (await UserProfile.findOne({ userId }).lean()) as IUserProfileLean | null;
    } catch (error) {
      logger.debug('Failed to get user profile:', error);
      return null;
    }
  }

  /**
   * Formats profile data into a compact string
   */
  function formatProfileData(profile: IUserProfileLean): string {
    const lines: string[] = [];

    for (const cat of PROFILE_CATEGORIES) {
      const catData = profile[cat as keyof IUserProfileLean];
      if (!catData || typeof catData !== 'object') {
        continue;
      }

      const fields = Object.entries(catData as Record<string, unknown>)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => {
          if (Array.isArray(v)) {
            return v.length > 0 ? `${k}:[${v.join(',')}]` : null;
          }
          if (typeof v === 'number') {
            // Format scale values
            return `${k}:${formatScaleValue(v)}`;
          }
          return `${k}:${v}`;
        })
        .filter(Boolean);

      if (fields.length > 0) {
        lines.push(`[${cat}] ${fields.join('; ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Formats scale values (-1 to 1) into descriptive terms
   */
  function formatScaleValue(value: number): string {
    if (value <= -0.6) return 'very_low';
    if (value <= -0.2) return 'low';
    if (value <= 0.2) return 'moderate';
    if (value <= 0.6) return 'high';
    return 'very_high';
  }

  /**
   * Gets and formats all memories for a user in two different formats
   * Now includes both legacy memories and profile data
   */
  async function getFormattedMemories({
    userId,
  }: t.GetFormattedMemoriesParams): Promise<t.FormattedMemoriesResult> {
    try {
      // Get legacy memories
      const memories = await getAllUserMemories(userId);

      // Get profile data (new system)
      const profile = await getUserProfile(userId);
      const profileFormatted = profile ? formatProfileData(profile) : '';

      // If no memories and no profile, return empty
      if ((!memories || memories.length === 0) && !profileFormatted) {
        return { withKeys: '', withoutKeys: '', totalTokens: 0 };
      }

      // Format legacy memories (exclude conversation_context as it's no longer used)
      const filteredMemories = memories?.filter((m) => m.key !== 'conversation_context') || [];
      const sortedMemories = filteredMemories.sort(
        (a, b) => new Date(a.updated_at!).getTime() - new Date(b.updated_at!).getTime(),
      );

      const legacyTokens = sortedMemories.reduce((sum, memory) => {
        return sum + (memory.tokenCount || 0);
      }, 0);

      // Estimate profile tokens (roughly 1 token per 4 chars)
      const profileTokens = profileFormatted ? Math.ceil(profileFormatted.length / 4) : 0;
      const totalTokens = legacyTokens + profileTokens;

      // Build withKeys format (for memory tool display)
      const legacyWithKeys = sortedMemories
        .map((memory, index) => {
          const date = formatDate(new Date(memory.updated_at!));
          const tokenInfo = memory.tokenCount ? ` [${memory.tokenCount} tokens]` : '';
          return `${index + 1}. [${date}]. ["key": "${memory.key}"]${tokenInfo}. ["value": "${memory.value}"]`;
        })
        .join('\n\n');

      // Build withoutKeys format (for natural conversation)
      const legacyWithoutKeys = sortedMemories
        .map((memory, index) => {
          const date = formatDate(new Date(memory.updated_at!));
          return `${index + 1}. [${date}]. ${memory.value}`;
        })
        .join('\n\n');

      // Combine profile + legacy memories - keep format clean and natural
      let withKeys = '';
      let withoutKeys = '';

      if (profileFormatted) {
        withKeys = `Profile:\n${profileFormatted}`;
        withoutKeys = `Profile:\n${profileFormatted}`;
      }

      if (legacyWithKeys) {
        withKeys = withKeys ? `${withKeys}\n\nNotes:\n${legacyWithKeys}` : legacyWithKeys;
        withoutKeys = withoutKeys
          ? `${withoutKeys}\n\nNotes:\n${legacyWithoutKeys}`
          : legacyWithoutKeys;
      }

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
    getUserProfile,
  };
}

export type MemoryMethods = ReturnType<typeof createMemoryMethods>;
