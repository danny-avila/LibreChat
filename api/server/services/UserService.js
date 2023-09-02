const { User, Key } = require('../../models');
const { encrypt, decrypt } = require('../utils');

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
    console.log(err);
    return err;
  }
};

const getUserKey = async ({ userId, name }) => {
  const keyValue = await Key.findOne({ userId, name }).lean();
  if (!keyValue) {
    throw new Error('User Provided Key not found');
  }
  return decrypt(keyValue.value);
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

const deleteUserKey = async ({ userId, name }) =>
  await Key.findOneAndDelete({ userId, name }).lean();

module.exports = { updateUserPluginsService, getUserKey, updateUserKey, deleteUserKey };
