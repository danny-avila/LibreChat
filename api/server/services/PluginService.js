const PluginAuth = require('../../models/schema/pluginAuthSchema');
const { encrypt, decrypt } = require('../../utils/crypto');

const getUserPluginAuthValue = async (user, authField) => {
  try {
    const pluginAuth = await PluginAuth.findOne({ user, authField });
    const decryptedValue = decrypt(pluginAuth.value);
    return decryptedValue;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const updateUserPluginAuth = async (userId, authField, pluginKey, value) => {
  try {
    const encryptedValue = encrypt(value);
    const pluginAuth = await PluginAuth.findOne({ userId, authField });
    if (pluginAuth) {
      const pluginAuth = await PluginAuth.updateOne(
        { userId, authField },
        { $set: { value: encryptedValue } }
      );
      return pluginAuth;
    } else {
      const newPluginAuth = await new PluginAuth({
        userId,
        authField,
        value: encryptedValue,
        pluginKey
      });
      newPluginAuth.save();
      return newPluginAuth;
    }
  } catch (err) {
    console.log(err);
    return err;
  }
};

const deleteUserPluginAuth = async (userId, authField) => {
  try {
    const response = await PluginAuth.deleteOne({ userId, authField });
    return response;
  } catch (err) {
    console.log(err);
    return err;
  }
};

module.exports = {
  getUserPluginAuthValue,
  updateUserPluginAuth,
  deleteUserPluginAuth
};
