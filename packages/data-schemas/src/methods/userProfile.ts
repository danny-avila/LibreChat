import { Types } from 'mongoose';
import logger from '~/config/winston';
import type * as t from '~/types';
import { PROFILE_CATEGORIES } from '~/types/userProfile';
import type {
  IUserProfile,
  IUserProfileLean,
  UpdateProfileParams,
  GetProfileParams,
  ProfileResult,
  FormattedProfileResult,
  ProfileCategory,
} from '~/types/userProfile';

/**
 * Factory function that creates profile database methods
 */
export function createProfileMethods(mongoose: typeof import('mongoose')) {
  /**
   * Updates a user's profile with new data (sparse merge)
   * Only updates fields that are provided, preserving existing data
   */
  async function updateProfile({ userId, updates }: UpdateProfileParams): Promise<ProfileResult> {
    try {
      const UserProfile = mongoose.models.UserProfile;

      // Build $set operations for nested fields
      const setOps: Record<string, unknown> = {};

      for (const [category, fields] of Object.entries(updates)) {
        // Skip non-category fields
        if (category === 'userId' || category === 'updated_at' || category === 'version') {
          continue;
        }

        // Validate category name
        if (!PROFILE_CATEGORIES.includes(category as ProfileCategory)) {
          logger.warn(`[UserProfile] Invalid category: ${category}`);
          continue;
        }

        if (fields && typeof fields === 'object') {
          for (const [field, value] of Object.entries(fields)) {
            // Only set non-null, non-undefined values
            if (value !== null && value !== undefined) {
              // Validate and compress values
              const compressedValue = compressValue(value);
              if (compressedValue !== undefined) {
                setOps[`${category}.${field}`] = compressedValue;
              }
            }
          }
        }
      }

      if (Object.keys(setOps).length === 0) {
        return { ok: true, updated: false };
      }

      setOps['updated_at'] = new Date();

      await UserProfile.findOneAndUpdate(
        { userId },
        {
          $set: setOps,
          $inc: { version: 1 },
        },
        { upsert: true, new: true },
      );

      logger.debug(
        `[UserProfile] Updated profile for user ${userId}: ${Object.keys(setOps).length} fields`,
      );
      return { ok: true, updated: true };
    } catch (error) {
      logger.error(
        `[UserProfile] Failed to update profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error(
        `Failed to update profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets a user's full profile
   */
  async function getProfile(userId: string | Types.ObjectId): Promise<IUserProfileLean | null> {
    try {
      const UserProfile = mongoose.models.UserProfile;
      return (await UserProfile.findOne({ userId }).lean()) as IUserProfileLean | null;
    } catch (error) {
      logger.error(
        `[UserProfile] Failed to get profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return null;
    }
  }

  /**
   * Gets formatted profile data for RAG injection
   * Returns a compact string representation of the profile
   */
  async function getProfileForRAG({
    userId,
    categories,
  }: GetProfileParams): Promise<FormattedProfileResult> {
    try {
      const profile = await getProfile(userId);

      if (!profile) {
        return { formatted: '', totalFields: 0 };
      }

      const lines: string[] = [];
      let totalFields = 0;

      // Use specified categories or all if not provided
      const targetCategories = categories || PROFILE_CATEGORIES;

      for (const cat of targetCategories) {
        // Skip metadata fields
        if (cat === 'userId' || cat === 'updated_at' || cat === 'version' || cat === '_id') {
          continue;
        }

        const catData = profile[cat as keyof IUserProfile];
        if (!catData || typeof catData !== 'object') {
          continue;
        }

        const fields = Object.entries(catData)
          .filter(([_, v]) => v !== null && v !== undefined && v !== '')
          .map(([k, v]) => {
            totalFields++;
            if (Array.isArray(v)) {
              return v.length > 0 ? `${k}:[${v.join(',')}]` : null;
            }
            if (typeof v === 'number') {
              // Convert scale values to descriptive terms
              return `${k}:${formatScaleValue(k, v)}`;
            }
            return `${k}:${v}`;
          })
          .filter(Boolean);

        if (fields.length > 0) {
          lines.push(`[${cat}] ${fields.join('; ')}`);
        }
      }

      return {
        formatted: lines.join('\n'),
        totalFields,
      };
    } catch (error) {
      logger.error(
        `[UserProfile] Failed to get profile for RAG: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { formatted: '', totalFields: 0 };
    }
  }

  /**
   * Deletes a user's entire profile
   */
  async function deleteProfile(userId: string | Types.ObjectId): Promise<ProfileResult> {
    try {
      const UserProfile = mongoose.models.UserProfile;
      const result = await UserProfile.findOneAndDelete({ userId });
      return { ok: !!result };
    } catch (error) {
      logger.error(
        `[UserProfile] Failed to delete profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { ok: false };
    }
  }

  /**
   * Deletes specific fields from a profile category
   */
  async function deleteProfileFields({
    userId,
    category,
    fields,
  }: {
    userId: string | Types.ObjectId;
    category: string;
    fields: string[];
  }): Promise<ProfileResult> {
    try {
      const UserProfile = mongoose.models.UserProfile;

      const unsetOps: Record<string, 1> = {};
      for (const field of fields) {
        unsetOps[`${category}.${field}`] = 1;
      }

      await UserProfile.findOneAndUpdate(
        { userId },
        {
          $unset: unsetOps,
          $set: { updated_at: new Date() },
          $inc: { version: 1 },
        },
      );

      return { ok: true };
    } catch (error) {
      logger.error(
        `[UserProfile] Failed to delete profile fields: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return { ok: false };
    }
  }

  /**
   * Gets profile storage size estimate in bytes
   */
  async function getProfileSize(userId: string | Types.ObjectId): Promise<number> {
    const profile = await getProfile(userId);
    return JSON.stringify(profile || {}).length;
  }

  return {
    updateProfile,
    getProfile,
    getProfileForRAG,
    deleteProfile,
    deleteProfileFields,
    getProfileSize,
  };
}

/**
 * Compresses values for efficient storage
 */
function compressValue(value: unknown): unknown {
  if (typeof value === 'string') {
    // Truncate strings to 100 chars max
    return value.slice(0, 100).trim();
  }
  if (Array.isArray(value)) {
    // Limit arrays to 5 items, truncate each item
    return value.slice(0, 5).map((v) => (typeof v === 'string' ? v.slice(0, 50).trim() : v));
  }
  if (typeof value === 'number') {
    // Clamp numeric values to -1 to 1 range for scales
    if (value >= -1 && value <= 1) {
      return Math.round(value * 100) / 100; // 2 decimal places
    }
    return value;
  }
  return value;
}

/**
 * Formats scale values (-1 to 1) into descriptive terms
 */
function formatScaleValue(fieldName: string, value: number): string {
  // Map numeric scale to descriptive terms
  if (value <= -0.6) return 'very_low';
  if (value <= -0.2) return 'low';
  if (value <= 0.2) return 'moderate';
  if (value <= 0.6) return 'high';
  return 'very_high';
}

export type ProfileMethods = ReturnType<typeof createProfileMethods>;
