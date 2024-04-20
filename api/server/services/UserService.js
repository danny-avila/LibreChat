const { ErrorTypes } = require('librechat-data-provider');
const { encrypt, decrypt } = require('~/server/utils');
const { User, Key } = require('~/models');
const { logger } = require('~/config');

const updateUserPluginsService = async (user, pluginKey, action) => {
  try {
    if (action === 'install') {
      return await User.updateOne(
        { _id: user._id },
        { $set: { plugins: [...user.plugins, pluginKey] } },
      );
    } else if (action === 'uninstall') {
      return await User.updateOne(
        { _id: user._id },
        { $set: { plugins: user.plugins.filter((plugin) => plugin !== pluginKey) } },
      );
    }
  } catch (err) {
    logger.error('[updateUserPluginsService]', err);
    return err;
  }
};

const getUserKey = async ({ userId, name }) => {
  const keyValue = await Key.findOne({ userId, name }).lean();
  if (!keyValue) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }
  return decrypt(keyValue.value);
};

const getUserKeyExpiry = async ({ userId, name }) => {
  const keyValue = await Key.findOne({ userId, name }).lean();
  if (!keyValue) {
    return { expiresAt: null };
  }
  return { expiresAt: keyValue.expiresAt };
};

const updateUserKey = async ({ userId, name, value, expiresAt }) => {
  const encryptedValue = encrypt(value);
  return await Key.findOneAndUpdate(
    { userId, name },
    {
      userId,
      name,
      value: encryptedValue,
      expiresAt: new Date(expiresAt),
    },
    { upsert: true, new: true },
  ).lean();
};

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
  updateUserPluginsService,
  getUserKey,
  getUserKeyExpiry,
  updateUserKey,
  deleteUserKey,
  checkUserKeyExpiry,
};
