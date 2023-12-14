const PluginAuth = require('~/models/schema/pluginAuthSchema');
const { encrypt, decrypt } = require('~/server/utils/');
const { logger } = require('~/config');

const getUserPluginAuthValue = async (user, authField) => {
  try {
    const pluginAuth = await PluginAuth.findOne({ user, authField }).lean();
    if (!pluginAuth) {
      return null;
    }

    const decryptedValue = decrypt(pluginAuth.value);
    return decryptedValue;
  } catch (err) {
    logger.error('[getUserPluginAuthValue]', err);
    return err;
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

const updateUserPluginAuth = async (userId, authField, pluginKey, value) => {
  try {
    const encryptedValue = encrypt(value);
    const pluginAuth = await PluginAuth.findOne({ userId, authField }).lean();
    if (pluginAuth) {
      const pluginAuth = await PluginAuth.updateOne(
        { userId, authField },
        { $set: { value: encryptedValue } },
      );
      return pluginAuth;
    } else {
      const newPluginAuth = await new PluginAuth({
        userId,
        authField,
        value: encryptedValue,
        pluginKey,
      });
      await newPluginAuth.save();
      return newPluginAuth;
    }
  } catch (err) {
    logger.error('[updateUserPluginAuth]', err);
    return err;
  }
};

const deleteUserPluginAuth = async (userId, authField) => {
  try {
    const response = await PluginAuth.deleteOne({ userId, authField });
    return response;
  } catch (err) {
    logger.error('[deleteUserPluginAuth]', err);
    return err;
  }
};

module.exports = {
  getUserPluginAuthValue,
  updateUserPluginAuth,
  deleteUserPluginAuth,
};
