const { ApiKey } = require('~/models');
const { logger } = require('~/config');

const randomString = (len) => {
  let result = '';
  while (result.length < len) {
    result += Math.random().toString(36).substring(2, 15);
  }
  return result.substring(0, len);
};

/**
 * Creates a new API key for a user
 * @async
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The unique identifier for the user
 * @param {string} params.name - The name for the API key
 * @param {Date} [params.expiresAt] - Optional expiration date for the API key
 * @returns {Promise<Object>} The created API key document with the generated key
 * @throws {Error} If there's an error during creation
 */
const createApiKey = async ({ userId, name, expiresAt = null }) => {
  try {
    // Generate a random API key with 'ak_' prefix
    const key = `ak_${randomString(30)}`;

    const apiKey = new ApiKey({
      userId,
      name,
      key,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    await apiKey.save();
    return { name, key, expiresAt };
  } catch (err) {
    logger.error('[createApiKey]', err);
    throw new Error(
      JSON.stringify({
        type: 'API_KEY_CREATION_ERROR',
      }),
    );
  }
};

/**
 * Validates an API key and returns the associated user ID
 * @async
 * @param {string} key - The API key to validate
 * @returns {Promise<string>} The user ID associated with the API key
 * @throws {Error} If the API key is invalid or expired
 */
const validateApiKey = async (key) => {
  try {
    const apiKey = await ApiKey.findOne({ key }).lean();

    if (!apiKey) {
      throw new Error(
        JSON.stringify({
          type: 'API_KEY_INVALID',
        }),
      );
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      throw new Error(
        JSON.stringify({
          type: 'API_KEY_EXPIRED',
        }),
      );
    }

    return apiKey.userId;
  } catch (err) {
    logger.error('[validateApiKey]', err);
    throw err;
  }
};

/**
 * Deletes an API key or all API keys for a user
 * @async
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The unique identifier for the user
 * @param {string} [params.keyId] - The ID of the specific API key to delete
 * @param {boolean} [params.all=false] - Whether to delete all API keys for the user
 * @returns {Promise<Object>} The result of the deletion operation
 * @throws {Error} If there's an error during deletion
 */
const deleteApiKey = async ({ userId, keyId, all = false }) => {
  try {
    if (all) {
      return await ApiKey.deleteMany({ userId });
    }
    return await ApiKey.findOneAndDelete({ userId, _id: keyId });
  } catch (err) {
    logger.error('[deleteApiKey]', err);
    throw new Error(
      JSON.stringify({
        type: 'API_KEY_DELETION_ERROR',
      }),
    );
  }
};

/**
 * Retrieves API keys for a user
 * @async
 * @param {Object} params - The parameters object
 * @param {string} params.userId - The unique identifier for the user
 * @param {boolean} [params.decrypt=false] - Whether to decrypt the API keys
 * @returns {Promise<Array>} Array of API key documents
 * @throws {Error} If there's an error during retrieval
 */
const getApiKeys = async ({ userId, decrypt = false }) => {
  try {
    const apiKeys = await ApiKey.find({ userId }).lean();

    if (decrypt) {
      const decryptedKeys = await Promise.all(
        apiKeys.map(async (apiKey) => {
          const decryptedKey = await decrypt(apiKey.key);
          return {
            ...apiKey,
            key: decryptedKey,
          };
        }),
      );
      return decryptedKeys;
    }

    return apiKeys;
  } catch (err) {
    logger.error('[getApiKeys]', err);
    throw new Error(
      JSON.stringify({
        type: 'API_KEY_RETRIEVAL_ERROR',
      }),
    );
  }
};

module.exports = {
  createApiKey,
  deleteApiKey,
  getApiKeys,
  validateApiKey,
};
