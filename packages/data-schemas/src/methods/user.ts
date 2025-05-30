import mongoose, { FilterQuery } from 'mongoose';
import { User, Balance } from '~/models';
import { IUser, BalanceConfig, UserCreateData, UserUpdateResult } from '~/types';
import { signPayload } from '~/schema/session';

/**
 * Search for a single user based on partial data and return matching user document as plain object.
 */
export async function findUser(
  searchCriteria: FilterQuery<IUser>,
  fieldsToSelect?: string | string[] | null,
): Promise<IUser | null> {
  const query = User.findOne(searchCriteria);
  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }
  return await query.lean();
}

/**
 * Count the number of user documents in the collection based on the provided filter.
 */
export async function countUsers(filter: FilterQuery<IUser> = {}): Promise<number> {
  return await User.countDocuments(filter);
}

/**
 * Creates a new user, optionally with a TTL of 1 week.
 */
export async function createUser(
  data: UserCreateData,
  balanceConfig?: BalanceConfig,
  disableTTL: boolean = true,
  returnUser: boolean = false,
): Promise<mongoose.Types.ObjectId | Partial<IUser>> {
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

    await Balance.findOneAndUpdate({ user: user._id }, update, { upsert: true, new: true }).lean();
  }

  if (returnUser) {
    return user.toObject() as Partial<IUser>;
  }
  return user._id as mongoose.Types.ObjectId;
}

/**
 * Update a user with new data without overwriting existing properties.
 */
export async function updateUser(
  userId: string,
  updateData: Partial<IUser>,
): Promise<IUser | null> {
  const updateOperation = {
    $set: updateData,
    $unset: { expiresAt: '' }, // Remove the expiresAt field to prevent TTL
  };
  return await User.findByIdAndUpdate(userId, updateOperation, {
    new: true,
    runValidators: true,
  }).lean();
}

/**
 * Retrieve a user by ID and convert the found user document to a plain object.
 */
export async function getUserById(
  userId: string,
  fieldsToSelect?: string | string[] | null,
): Promise<IUser | null> {
  const query = User.findById(userId);
  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }
  return await query.lean();
}

/**
 * Delete a user by their unique ID.
 */
export async function deleteUserById(userId: string): Promise<UserUpdateResult> {
  try {
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
export async function generateToken(user: IUser): Promise<string> {
  if (!user) {
    throw new Error('No user provided');
  }

  const expires = eval(process.env.SESSION_EXPIRY ?? '0') ?? 1000 * 60 * 15;

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
