import { Schema, Document, Types } from 'mongoose';
import { logger } from '~/config';

export interface IToken extends Document {
  userId: Types.ObjectId;
  email?: string;
  type?: string;
  identifier?: string;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Map<string, unknown>;
}

const tokenSchema: Schema<IToken> = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'user',
  },
  email: {
    type: String,
  },
  type: {
    type: String,
  },
  identifier: {
    type: String,
  },
  token: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
  },
});

tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Creates a new Token instance.
 * @param {Object} tokenData - The data for the new Token.
 * @param {mongoose.Types.ObjectId} tokenData.userId - The user's ID. It is required.
 * @param {String} tokenData.email - The user's email.
 * @param {String} tokenData.token - The token. It is required.
 * @param {Number} tokenData.expiresIn - The number of seconds until the token expires.
 * @returns {Promise<mongoose.Document>} The new Token instance.
 * @throws Will throw an error if token creation fails.
 */
tokenSchema.statics.createToken = async function (tokenData) {
  try {
    const currentTime = new Date();
    const expiresAt = new Date(currentTime.getTime() + tokenData.expiresIn * 1000);

    const newTokenData = {
      ...tokenData,
      createdAt: currentTime,
      expiresAt,
    };

    return await this.create(newTokenData);
  } catch (error) {
    logger.debug('An error occurred while creating token:', error);
    throw error;
  }
};

/**
 * Updates a Token document that matches the provided query.
 * @param {Object} query - The query to match against.
 * @param {mongoose.Types.ObjectId|String} query.userId - The ID of the user.
 * @param {String} query.token - The token value.
 * @param {String} [query.email] - The email of the user.
 * @param {String} [query.identifier] - Unique, alternative identifier for the token.
 * @param {Object} updateData - The data to update the Token with.
 * @returns {Promise<mongoose.Document|null>} The updated Token document, or null if not found.
 * @throws Will throw an error if the update operation fails.
 */
tokenSchema.statics.updateToken = async function (query, updateData) {
  try {
    return await this.findOneAndUpdate(query, updateData, { new: true });
  } catch (error) {
    logger.debug('An error occurred while updating token:', error);
    throw error;
  }
};

/**
 * Deletes all Token documents that match the provided token, user ID, or email.
 * @param {Object} query - The query to match against.
 * @param {mongoose.Types.ObjectId|String} query.userId - The ID of the user.
 * @param {String} query.token - The token value.
 * @param {String} [query.email] - The email of the user.
 * @param {String} [query.identifier] - Unique, alternative identifier for the token.
 * @returns {Promise<Object>} The result of the delete operation.
 * @throws Will throw an error if the delete operation fails.
 */
tokenSchema.statics.deleteTokens = async function (query) {
  try {
    return await Token.deleteMany({
      $or: [
        { userId: query.userId },
        { token: query.token },
        { email: query.email },
        { identifier: query.identifier },
      ],
    });
  } catch (error) {
    logger.debug('An error occurred while deleting tokens:', error);
    throw error;
  }
};

/**
 * Finds a Token document that matches the provided query.
 * @param {Object} query - The query to match against.
 * @param {mongoose.Types.ObjectId|String} query.userId - The ID of the user.
 * @param {String} query.token - The token value.
 * @param {String} [query.email] - The email of the user.
 * @param {String} [query.identifier] - Unique, alternative identifier for the token.
 * @returns {Promise<Object|null>} The matched Token document, or null if not found.
 * @throws Will throw an error if the find operation fails.
 */
tokenSchema.statics.findToken = async function (query) {
  try {
    const conditions = [];

    if (query.userId) {
      conditions.push({ userId: query.userId });
    }
    if (query.token) {
      conditions.push({ token: query.token });
    }
    if (query.email) {
      conditions.push({ email: query.email });
    }
    if (query.identifier) {
      conditions.push({ identifier: query.identifier });
    }

    const token = await this.findOne({
      $and: conditions,
    }).lean();

    return token;
  } catch (error) {
    logger.debug('An error occurred while finding token:', error);
    throw error;
  }
};

export default tokenSchema;
