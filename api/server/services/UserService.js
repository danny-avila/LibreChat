const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { encrypt, decrypt } = require('~/server/utils/crypto');
const { updateUser } = require('~/models');
const { Key } = require('~/db/models');

/**
 * Updates the plugins for a user based on the action specified (install/uninstall).
 * @async
 * @param {Object} user - The user whose plugins are to be updated.
 * @param {string} pluginKey - The key of the plugin to install or uninstall.
 * @param {'install' | 'uninstall'} action - The action to perform, 'install' or 'uninstall'.
 * @returns {Promise<Object>} The result of the update operation.
 * @throws Logs the error internally if the update operation fails.
 * @description This function updates the plugin array of a user document based on the specified action.
 *              It adds a plugin key to the plugins array for an 'install' action, and removes it for an 'uninstall' action.
 */
const updateUserPluginsService = async (user, pluginKey, action) => {
  try {
    const userPlugins = user.plugins || [];
    if (action === 'install') {
      return await updateUser(user._id, { plugins: [...userPlugins, pluginKey] });
    } else if (action === 'uninstall') {
      return await updateUser(user._id, {
        plugins: userPlugins.filter((plugin) => plugin !== pluginKey),
      });
    }
  } catch (err) {
    logger.error('[updateUserPluginsService]', err);
    return err;
  }
};

/**
 * Retrieves and decrypts the key value for a given user identified by userId and identifier name.
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @returns {Promise<string>} The decrypted key value.
 * @throws {Error} Throws an error if the key is not found or if there is a problem during key retrieval.
 * @description This function searches for a user's key in the database using their userId and name.
 *              If found, it decrypts the value of the key and returns it. If no key is found, it throws
 *              an error indicating that there is no user key available.
 */
const getUserKey = async ({ userId, name }) => {
  const keyValue = await Key.findOne({ userId, name }).lean();
  if (!keyValue) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }
  return await decrypt(keyValue.value);
};

/**
 * Retrieves, decrypts, and parses the key values for a given user identified by userId and name.
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @returns {Promise<Record<string,string>>} The decrypted and parsed key values.
 * @throws {Error} Throws an error if the key is invalid or if there is a problem during key value parsing.
 * @description This function retrieves a user's encrypted key using their userId and name, decrypts it,
 *              and then attempts to parse the decrypted string into a JSON object. If the parsing fails,
 *              it throws an error indicating that the user key is invalid.
 */
const getUserKeyValues = async ({ userId, name }) => {
  let userValues = await getUserKey({ userId, name });
  try {
    userValues = JSON.parse(userValues);
  } catch (e) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.INVALID_USER_KEY,
      }),
    );
  }
  return userValues;
};

/**
 * Retrieves the expiry information of a user's key identified by userId and name.
 * @async
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @returns {Promise<{expiresAt: Date | null}>} The expiry date of the key or null if the key doesn't exist.
 * @description This function fetches a user's key from the database using their userId and name and
 *              returns its expiry date. If the key is not found, it returns null for the expiry date.
 */
const getUserKeyExpiry = async ({ userId, name }) => {
  const keyValue = await Key.findOne({ userId, name }).lean();
  if (!keyValue) {
    return { expiresAt: null };
  }
  return { expiresAt: keyValue.expiresAt || 'never' };
};

/**
 * Updates or inserts a new key for a given user identified by userId and name, with a specified value and expiry date.
 * @async
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} params.name - The name associated with the key.
 * @param {string} params.value - The value to be encrypted and stored as the key's value.
 * @param {Date} params.expiresAt - The expiry date for the key [optional]
 * @returns {Promise<Object>} The updated or newly inserted key document.
 * @description This function either updates an existing user key or inserts a new one into the database,
 *              after encrypting the provided value. It sets the provided expiry date for the key (or unsets for no expiry).
 */
const updateUserKey = async ({ userId, name, value, expiresAt = null }) => {
  const encryptedValue = await encrypt(value);
  let updateObject = {
    userId,
    name,
    value: encryptedValue,
  };
  const updateQuery = { $set: updateObject };
  // add expiresAt to the update object if it's not null
  if (expiresAt) {
    updateObject.expiresAt = new Date(expiresAt);
  } else {
    // make sure to remove if already present
    updateQuery.$unset = { expiresAt };
  }
  return await Key.findOneAndUpdate({ userId, name }, updateQuery, {
    upsert: true,
    new: true,
  }).lean();
};

/**
 * Deletes a key or all keys for a given user identified by userId, optionally based on a specified name.
 * @async
 * @param {Object} params - The parameters object.
 * @param {string} params.userId - The unique identifier for the user.
 * @param {string} [params.name] - The name associated with the key to delete. If not provided and all is true, deletes all keys.
 * @param {boolean} [params.all=false] - Whether to delete all keys for the user.
 * @returns {Promise<Object>} The result of the deletion operation.
 * @description This function deletes a specific key or all keys for a user from the database.
 *              If a name is provided and all is false, it deletes only the key with that name.
 *              If all is true, it ignores the name and deletes all keys for the user.
 */
const deleteUserKey = async ({ userId, name, all = false }) => {
  if (all) {
    return await Key.deleteMany({ userId });
  }

  await Key.findOneAndDelete({ userId, name }).lean();
};

/**
 * Checks if a user key has expired based on the provided expiration date and endpoint.
 * If the key has expired, it throws an Error with details including the type of error, the expiration date, and the endpoint.
 *
 * @param {string} expiresAt - The expiration date of the user key in a format that can be parsed by the Date constructor.
 * @param {string} endpoint - The endpoint associated with the user key to be checked.
 * @throws {Error} Throws an error if the user key has expired. The error message is a stringified JSON object
 * containing the type of error (`ErrorTypes.EXPIRED_USER_KEY`), the expiration date in the local string format, and the endpoint.
 */
const checkUserKeyExpiry = (expiresAt, endpoint) => {
  const expiresAtDate = new Date(expiresAt);
  if (expiresAtDate < new Date()) {
    const errorMessage = JSON.stringify({
      type: ErrorTypes.EXPIRED_USER_KEY,
      expiredAt: expiresAtDate.toLocaleString(),
      endpoint,
    });
    throw new Error(errorMessage);
  }
};

module.exports = {
  getUserKey,
  updateUserKey,
  deleteUserKey,
  getUserKeyValues,
  getUserKeyExpiry,
  checkUserKeyExpiry,
  updateUserPluginsService,
};
