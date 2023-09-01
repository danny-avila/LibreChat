const User = require('../../models/User');
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

const getUserKey = async ({ userId, key }) => {
  const user = await User.findById(userId, 'keys.$[elem]').arrayFilters([{ 'elem.name': key }]);
  const keyValue = user.keys.find((k) => k.name === key);
  if (!keyValue) {
    throw new Error('Key not found');
  }
  return decrypt(keyValue.value);
};

const updateUserKey = async ({ userId, key, value, expiresAt }) => {
  console.log({ userId, key, value, expiresAt });
  const expiresAtDate = new Date(expiresAt);
  const encryptedValue = encrypt(value);

  // Check if the key exists
  const user = await User.findOne({ _id: userId, 'keys.name': key });

  if (user) {
    // If the key exists, update it
    await User.updateOne(
      { _id: userId, 'keys.name': key },
      {
        $set: { 'keys.$.value': encryptedValue, 'keys.$.expiresAt': expiresAtDate },
      },
    );
  } else {
    // If the key doesn't exist, add a new one
    await User.updateOne(
      { _id: userId },
      {
        $push: { keys: { name: key, value: encryptedValue, expiresAt: expiresAtDate } },
      },
    );
  }
};

const deleteUserKey = async ({ userId, key }) => {
  return await User.updateOne({ _id: userId }, { $pull: { keys: { name: key } } });
};

module.exports = { updateUserPluginsService, getUserKey, updateUserKey, deleteUserKey };
