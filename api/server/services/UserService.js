const { User, Key } = require('~/models');
const { encrypt, decrypt } = require('~/server/utils');
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
    throw new Error('User-provided key not found');
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

const checkUserKeyExpiry = (expiresAt, message) => {
  const expiresAtDate = new Date(expiresAt);
  if (expiresAtDate < new Date()) {
    const expiryStr = `User-provided key expired at ${expiresAtDate.toLocaleString()}`;
    const errorMessage = message ? `${message}\n${expiryStr}` : expiryStr;
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
