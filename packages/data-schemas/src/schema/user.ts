import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { SystemRoles } from 'librechat-data-provider';
import { default as balanceSchema } from './balance';
import { signPayload } from './session';
export interface IUser extends Document {
  name?: string;
  username?: string;
  email: string;
  emailVerified: boolean;
  password?: string;
  avatar?: string;
  provider: string;
  role?: string;
  googleId?: string;
  facebookId?: string;
  openidId?: string;
  samlId?: string;
  ldapId?: string;
  githubId?: string;
  discordId?: string;
  appleId?: string;
  plugins?: unknown[];
  twoFactorEnabled?: boolean;
  totpSecret?: string;
  backupCodes?: Array<{
    codeHash: string;
    used: boolean;
    usedAt?: Date | null;
  }>;
  refreshToken?: Array<{
    refreshToken: string;
  }>;
  expiresAt?: Date;
  termsAccepted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// Session sub-schema
const SessionSchema = new Schema(
  {
    refreshToken: {
      type: String,
      default: '',
    },
  },
  { _id: false },
);

// Backup code sub-schema
const BackupCodeSchema = new Schema(
  {
    codeHash: { type: String, required: true },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
    },
    username: {
      type: String,
      lowercase: true,
      default: '',
    },
    email: {
      type: String,
      required: [true, "can't be blank"],
      lowercase: true,
      unique: true,
      match: [/\S+@\S+\.\S+/, 'is invalid'],
      index: true,
    },
    emailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    password: {
      type: String,
      trim: true,
      minlength: 8,
      maxlength: 128,
    },
    avatar: {
      type: String,
      required: false,
    },
    provider: {
      type: String,
      required: true,
      default: 'local',
    },
    role: {
      type: String,
      default: SystemRoles.USER,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    openidId: {
      type: String,
      unique: true,
      sparse: true,
    },
    samlId: {
      type: String,
      unique: true,
      sparse: true,
    },
    ldapId: {
      type: String,
      unique: true,
      sparse: true,
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    discordId: {
      type: String,
      unique: true,
      sparse: true,
    },
    appleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    plugins: {
      type: Array,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    totpSecret: {
      type: String,
    },
    backupCodes: {
      type: [BackupCodeSchema],
    },
    refreshToken: {
      type: [SessionSchema],
    },
    expiresAt: {
      type: Date,
      expires: 604800, // 7 days in seconds
    },
    termsAccepted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

/**
 * Search for a single user based on partial data and return matching user document as plain object.
 * @param {Partial<MongoUser>} searchCriteria - The partial data to use for searching the user.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<MongoUser>} A plain object representing the user document, or `null` if no user is found.
 */
userSchema.statics.findUser = async function (
  searchCriteria: Partial<IUser>,
  fieldsToSelect: string | string[] | null = null,
) {
  const query = this.findOne(searchCriteria);
  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }
  return await query.lean();
};

/**
 * Count the number of user documents in the collection based on the provided filter.
 *
 * @param {Object} [filter={}] - The filter to apply when counting the documents.
 * @returns {Promise<number>} The count of documents that match the filter.
 */
userSchema.statics.countUsers = async function (filter: Record<string, any> = {}) {
  return await this.countDocuments(filter);
};
/**
 * Creates a new user, optionally with a TTL of 1 week.
 * @param {MongoUser} data - The user data to be created, must contain user_id.
 * @param {boolean} [disableTTL=true] - Whether to disable the TTL. Defaults to `true`.
 * @param {boolean} [returnUser=false] - Whether to return the created user object.
 * @returns {Promise<ObjectId|MongoUser>} A promise that resolves to the created user document ID or user object.
 * @throws {Error} If a user with the same user_id already exists.
 */
userSchema.statics.createUser = async function (
  data: Partial<IUser>,
  balanceConfig: any,
  disableTTL: boolean = true,
  returnUser: boolean = false,
) {
  const userData: Partial<IUser> = {
    ...data,
    expiresAt: disableTTL ? null : new Date(Date.now() + 604800 * 1000), // 1 week in milliseconds
  };

  if (disableTTL) {
    delete userData.expiresAt;
  }

  const user = await this.create(userData);

  // If balance is enabled, create or update a balance record for the user using global.interfaceConfig.balance
  if (balanceConfig?.enabled && balanceConfig?.startBalance) {
    const update = {
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

    const balanceModel = mongoose.model('Balance', balanceSchema);
    await balanceModel
      .findOneAndUpdate({ user: user._id }, update, { upsert: true, new: true })
      .lean();
  }

  if (returnUser) {
    return user.toObject();
  }
  return user._id;
};
/**
 * Update a user with new data without overwriting existing properties.
 *
 * @param {string} userId - The ID of the user to update.
 * @param {Object} updateData - An object containing the properties to update.
 * @returns {Promise<MongoUser>} The updated user document as a plain object, or `null` if no user is found.
 */
userSchema.statics.updateUser = async function (userId: string, updateData: Partial<IUser>) {
  const updateOperation = {
    $set: updateData,
    $unset: { expiresAt: '' }, // Remove the expiresAt field to prevent TTL
  };
  return await this.findByIdAndUpdate(userId, updateOperation, {
    new: true,
    runValidators: true,
  }).lean();
};

/**
 * Retrieve a user by ID and convert the found user document to a plain object.
 *
 * @param {string} userId - The ID of the user to find and return as a plain object.
 * @param {string|string[]} [fieldsToSelect] - The fields to include or exclude in the returned document.
 * @returns {Promise<MongoUser>} A plain object representing the user document, or `null` if no user is found.
 */
userSchema.statics.getUserById = async function (
  userId: string,
  fieldsToSelect: string | string[] | null = null,
) {
  const query = this.findById(userId);
  if (fieldsToSelect) {
    query.select(fieldsToSelect);
  }
  return await query.lean();
};

/**
 * Delete a user by their unique ID.
 *
 * @param {string} userId - The ID of the user to delete.
 * @returns {Promise<{ deletedCount: number }>} An object indicating the number of deleted documents.
 */
userSchema.statics.deleteUserById = async function (userId: string) {
  try {
    const result = await this.deleteOne({ _id: userId });
    if (result.deletedCount === 0) {
      return { deletedCount: 0, message: 'No user found with that ID.' };
    }
    return { deletedCount: result.deletedCount, message: 'User was deleted successfully.' };
  } catch (error: any) {
    throw new Error('Error deleting user: ' + error?.message);
  }
};

/**
 * Generates a JWT token for a given user.
 *
 * @param {MongoUser} user - The user for whom the token is being generated.
 * @returns {Promise<string>} A promise that resolves to a JWT token.
 */
userSchema.methods.generateToken = async function (user: IUser): Promise<string> {
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
};

export default userSchema;
