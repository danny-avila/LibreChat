const { logger } = require('@librechat/data-schemas');
const { encrypt, decrypt } = require('@librechat/api');
const {
  findPluginAuthsByKeys,
  findOnePluginAuth,
  updatePluginAuth,
  deletePluginAuth,
} = require('~/models');

/**
 * Asynchronously retrieves and decrypts the authentication value for a user's plugin, based on a specified authentication field.
 *
 * @param {string} userId - The unique identifier of the user for whom the plugin authentication value is to be retrieved.
 * @param {string} authField - The specific authentication field (e.g., 'API_KEY', 'URL') whose value is to be retrieved and decrypted.
 * @param {boolean} throwError - Whether to throw an error if the authentication value does not exist. Defaults to `true`.
 * @returns {Promise<string|null>} A promise that resolves to the decrypted authentication value if found, or `null` if no such authentication value exists for the given user and field.
 *
 * The function throws an error if it encounters any issue during the retrieval or decryption process, or if the authentication value does not exist.
 *
 * @example
 * // To get the decrypted value of the 'token' field for a user with userId '12345':
 * getUserPluginAuthValue('12345', 'token').then(value => {
 *   console.log(value);
 * }).catch(err => {
 *   console.error(err);
 * });
 *
 * @throws {Error} Throws an error if there's an issue during the retrieval or decryption process, or if the authentication value does not exist.
 * @async
 */
const getUserPluginAuthValue = async (userId, authField, throwError = true) => {
  try {
    const pluginAuth = await findOnePluginAuth({ userId, authField });
    if (!pluginAuth) {
      throw new Error(`No plugin auth ${authField} found for user ${userId}`);
    }

    const decryptedValue = await decrypt(pluginAuth.value);
    return decryptedValue;
  } catch (err) {
    if (!throwError) {
      return null;
    }
    logger.error('[getUserPluginAuthValue]', err);
    throw err;
  }
};

/**
 * Asynchronously retrieves and decrypts all authentication values for a user across multiple plugins.
 *
 * @param {string} userId - The unique identifier of the user.
 * @param {string[]} pluginKeys - An array of plugin keys to retrieve authentication values for.
 * @param {boolean} [throwError=true] - Whether to throw an error if issues occur.
 * @returns {Promise<Record<string, Record<string, string>>>} A promise that resolves to a map where keys are pluginKeys
 * and values are objects of authField:decryptedValue pairs. If a pluginKey has no auth values, its entry will be an empty object.
 *
 * @example
 * // To get all decrypted values for user '12345' for plugins 'pluginA' and 'pluginB':
 * getUsersPluginsAuthValuesMap('12345', ['pluginA', 'pluginB']).then(pluginsAuthMap => {
 *   console.log(pluginsAuthMap);
 *   // {
 *   //   "pluginA": { "API_KEY": "key_A", "SECRET": "secret_A" },
 *   //   "pluginB": { "TOKEN": "token_B" }
 *   // }
 * }).catch(err => {
 *   console.error(err);
 * });
 */
const getUsersPluginsAuthValuesMap = async (userId, pluginKeys, throwError = true) => {
  try {
    if (!pluginKeys || pluginKeys.length === 0) {
      return {};
    }

    const pluginAuths = await findPluginAuthsByKeys({ userId, pluginKeys });

    const pluginsAuthMap = {};
    for (const key of pluginKeys) {
      pluginsAuthMap[key] = {};
    }

    await Promise.all(
      pluginAuths.map(async (auth) => {
        try {
          const decryptedValue = await decrypt(auth.value);
          if (pluginsAuthMap[auth.pluginKey]) {
            pluginsAuthMap[auth.pluginKey][auth.authField] = decryptedValue;
          } else {
            // This case should ideally not happen if pluginKey in auth record is one of the requested pluginKeys.
            // Logging a warning if it occurs.
            logger.warn(
              `[getUsersPluginsAuthValuesMap] Encountered auth record for unexpected pluginKey: ${auth.pluginKey} for userId ${userId}. Requested keys: ${pluginKeys.join(', ')}`,
            );
          }
        } catch (decryptError) {
          logger.error(
            `[getUsersPluginsAuthValuesMap] Error decrypting value for userId ${userId}, pluginKey ${auth.pluginKey}, authField ${auth.authField}`,
            decryptError,
          );
          if (throwError) {
            throw new Error(
              `Decryption failed for plugin ${auth.pluginKey}, field ${auth.authField}: ${decryptError.message}`,
            );
          }
        }
      }),
    );

    return pluginsAuthMap;
  } catch (err) {
    if (!throwError) {
      const initialMap = {};
      if (pluginKeys && pluginKeys.length > 0) {
        for (const key of pluginKeys) {
          initialMap[key] = {};
        }
      }
      return initialMap;
    }
    logger.error(
      `[getUsersPluginsAuthValuesMap] Error fetching auth values for userId ${userId}, pluginKeys: ${pluginKeys.join(', ')}`,
      err,
    );
    throw err;
  }
};

// const updateUserPluginAuth = async (userId, authField, pluginKey, value) => {
//   try {
//     const encryptedValue = encrypt(value);

//     const pluginAuth = await PluginAuth.findOneAndUpdate(
//       { userId, authField },
//       {
//         $set: {
//           value: encryptedValue,
//           pluginKey
//         }
//       },
//       {
//         new: true,
//         upsert: true
//       }
//     );

//     return pluginAuth;
//   } catch (err) {
//     logger.error('[getUserPluginAuthValue]', err);
//     return err;
//   }
// };

/**
 *
 * @async
 * @param {string} userId
 * @param {string} authField
 * @param {string} pluginKey
 * @param {string} value
 * @returns {Promise<IPluginAuth>}
 * @throws {Error}
 */
const updateUserPluginAuth = async (userId, authField, pluginKey, value) => {
  try {
    const encryptedValue = await encrypt(value);
    return await updatePluginAuth({
      userId,
      authField,
      pluginKey,
      value: encryptedValue,
    });
  } catch (err) {
    logger.error('[updateUserPluginAuth]', err);
    return err;
  }
};

/**
 * @async
 * @param {string} userId
 * @param {string | null} authField - The specific authField to delete, or null if `all` is true.
 * @param {boolean} [all=false] - Whether to delete all auths for the user (or for a specific pluginKey if provided).
 * @param {string} [pluginKey] - Optional. If `all` is true and `pluginKey` is provided, delete all auths for this user and pluginKey.
 * @returns {Promise<import('mongoose').DeleteResult>}
 * @throws {Error}
 */
const deleteUserPluginAuth = async (userId, authField, all = false, pluginKey) => {
  try {
    return await deletePluginAuth({
      userId,
      authField,
      pluginKey,
      all,
    });
  } catch (err) {
    logger.error(
      `[deleteUserPluginAuth] Error deleting ${all ? 'all' : 'single'} auth(s) for userId: ${userId}${pluginKey ? ` and pluginKey: ${pluginKey}` : ''}`,
      err,
    );
    return err;
  }
};

module.exports = {
  getUserPluginAuthValue,
  getUsersPluginsAuthValuesMap,
  updateUserPluginAuth,
  deleteUserPluginAuth,
};
