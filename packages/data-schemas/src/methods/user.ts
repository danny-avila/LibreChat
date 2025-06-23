import mongoose, { FilterQuery } from 'mongoose';
import type { IUser, BalanceConfig, UserCreateData, UserUpdateResult } from '~/types';
import { signPayload } from '~/crypto';

/** Factory function that takes mongoose instance and returns the methods */
export function createUserMethods(mongoose: typeof import('mongoose')) {
  /**
   * Search for a single user based on partial data and return matching user document as plain object.
   */
  async function findUser(
    searchCriteria: FilterQuery<IUser>,
    fieldsToSelect?: string | string[] | null,
  ): Promise<IUser | null> {
    const User = mongoose.models.User;
    const query = User.findOne(searchCriteria);
    if (fieldsToSelect) {
      query.select(fieldsToSelect);
    }
    return (await query.lean()) as IUser | null;
  }

  /**
   * Count the number of user documents in the collection based on the provided filter.
   */
  async function countUsers(filter: FilterQuery<IUser> = {}): Promise<number> {
    const User = mongoose.models.User;
    return await User.countDocuments(filter);
  }

  /**
   * Creates a new user, optionally with a TTL of 1 week.
   */
  async function createUser(
    data: UserCreateData,
    balanceConfig?: BalanceConfig,
    disableTTL: boolean = true,
    returnUser: boolean = false,
  ): Promise<mongoose.Types.ObjectId | Partial<IUser>> {
    const User = mongoose.models.User;
    const Balance = mongoose.models.Balance;

    const userData: Partial<IUser> = {
      ...data,
      expiresAt: disableTTL ? undefined : new Date(Date.now() + 604800 * 1000), // 1 week in milliseconds
    };

    if (disableTTL) {
      delete userData.expiresAt;
    }

    const user = await User.create(userData);

    // If balance is enabled, create or update a balance record for the user
    if (balanceConfig?.enabled && balanceConfig?.startBalance) {
      const update: {
        $inc: { tokenCredits: number };
        $set?: {
          autoRefillEnabled: boolean;
          refillIntervalValue: number;
          refillIntervalUnit: string;
          refillAmount: number;
        };
      } = {
        $inc: { tokenCredits: balanceConfig.startBalance },
      };

      if (
        balanceConfig.autoRefillEnabled &&
        balanceConfig.refillIntervalValue != null &&
        balanceConfig.refillIntervalUnit != null &&
        balanceConfig.refillAmount != null
      ) {
        update.$set = {
          autoRefillEnabled: true,
          refillIntervalValue: balanceConfig.refillIntervalValue,
          refillIntervalUnit: balanceConfig.refillIntervalUnit,
          refillAmount: balanceConfig.refillAmount,
        };
      }

      await Balance.findOneAndUpdate({ user: user._id }, update, {
        upsert: true,
        new: true,
      }).lean();
    }

    if (returnUser) {
      return user.toObject() as Partial<IUser>;
    }
    return user._id as mongoose.Types.ObjectId;
  }

  /**
   * Update a user with new data without overwriting existing properties.
   */
  async function updateUser(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
    const User = mongoose.models.User;
    const updateOperation = {
      $set: updateData,
      $unset: { expiresAt: '' }, // Remove the expiresAt field to prevent TTL
    };
    return (await User.findByIdAndUpdate(userId, updateOperation, {
      new: true,
      runValidators: true,
    }).lean()) as IUser | null;
  }

  /**
   * Retrieve a user by ID and convert the found user document to a plain object.
   */
  async function getUserById(
    userId: string,
    fieldsToSelect?: string | string[] | null,
  ): Promise<IUser | null> {
    const User = mongoose.models.User;
    const query = User.findById(userId);
    if (fieldsToSelect) {
      query.select(fieldsToSelect);
    }
    return (await query.lean()) as IUser | null;
  }

  /**
   * Delete a user by their unique ID.
   */
  async function deleteUserById(userId: string): Promise<UserUpdateResult> {
    try {
      const User = mongoose.models.User;
      const result = await User.deleteOne({ _id: userId });
      if (result.deletedCount === 0) {
        return { deletedCount: 0, message: 'No user found with that ID.' };
      }
      return { deletedCount: result.deletedCount, message: 'User was deleted successfully.' };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error('Error deleting user: ' + errorMessage);
    }
  }

  /**
   * Generates a JWT token for a given user.
   */
  async function generateToken(user: IUser): Promise<string> {
    if (!user) {
      throw new Error('No user provided');
    }

    let expires = 1000 * 60 * 15;

    if (process.env.SESSION_EXPIRY !== undefined && process.env.SESSION_EXPIRY !== '') {
      try {
        const evaluated = eval(process.env.SESSION_EXPIRY);
        if (evaluated) {
          expires = evaluated;
        }
      } catch (error) {
        console.warn('Invalid SESSION_EXPIRY expression, using default:', error);
      }
    }

    return await signPayload({
      payload: {
        id: user._id,
        username: user.username,
        provider: user.provider,
        email: user.email,
      },
      secret: process.env.JWT_SECRET,
      expirationTime: expires / 1000,
    });
  }

  /**
   * Update a user's personalization memories setting.
   * Handles the edge case where the personalization object doesn't exist.
   */
  async function toggleUserMemories(
    userId: string,
    memoriesEnabled: boolean,
  ): Promise<IUser | null> {
    const User = mongoose.models.User;

    // First, ensure the personalization object exists
    const user = await User.findById(userId);
    if (!user) {
      return null;
    }

    // Use $set to update the nested field, which will create the personalization object if it doesn't exist
    const updateOperation = {
      $set: {
        'personalization.memories': memoriesEnabled,
      },
    };

    return (await User.findByIdAndUpdate(userId, updateOperation, {
      new: true,
      runValidators: true,
    }).lean()) as IUser | null;
  }

  /**
   * Search for users by pattern matching on name, email, or username (case-insensitive)
   * @param searchPattern - The pattern to search for
   * @param limit - Maximum number of results to return
   * @param fieldsToSelect - The fields to include or exclude in the returned documents
   * @returns Array of matching user documents
   */
  const searchUsers = async function ({
    searchPattern,
    limit = 20,
    fieldsToSelect = null,
  }: {
    searchPattern: string;
    limit?: number;
    fieldsToSelect?: string | string[] | null;
  }) {
    if (!searchPattern || searchPattern.trim().length === 0) {
      return [];
    }

    const regex = new RegExp(searchPattern.trim(), 'i');
    const User = mongoose.models.User;

    const query = User.find({
      $or: [{ email: regex }, { name: regex }, { username: regex }],
    }).limit(limit * 2); // Get more results to allow for relevance sorting

    if (fieldsToSelect) {
      query.select(fieldsToSelect);
    }

    const users = await query.lean();

    // Score results by relevance
    const exactRegex = new RegExp(`^${searchPattern.trim()}$`, 'i');
    const startsWithPattern = searchPattern.trim().toLowerCase();

    const scoredUsers = users.map((user) => {
      const searchableFields = [user.name, user.email, user.username].filter(Boolean);
      let maxScore = 0;

      for (const field of searchableFields) {
        const fieldLower = field.toLowerCase();
        let score = 0;

        // Exact match gets highest score
        if (exactRegex.test(field)) {
          score = 100;
        }
        // Starts with query gets high score
        else if (fieldLower.startsWith(startsWithPattern)) {
          score = 80;
        }
        // Contains query gets medium score
        else if (fieldLower.includes(startsWithPattern)) {
          score = 50;
        }
        // Default score for regex match
        else {
          score = 10;
        }

        maxScore = Math.max(maxScore, score);
      }

      return { ...user, _searchScore: maxScore };
    });

    /** Top results sorted by relevance */
    return scoredUsers
      .sort((a, b) => b._searchScore - a._searchScore)
      .slice(0, limit)
      .map((user) => {
        // Remove the search score from final results
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _searchScore, ...userWithoutScore } = user;
        return userWithoutScore;
      });
  };

  return {
    findUser,
    countUsers,
    createUser,
    updateUser,
    searchUsers,
    getUserById,
    generateToken,
    deleteUserById,
    toggleUserMemories,
  };
}

export type UserMethods = ReturnType<typeof createUserMethods>;
