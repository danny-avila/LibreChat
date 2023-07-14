const User = require('../../models/User');

const updateUserPluginsService = async (user, pluginKey, action) => {
  try {
    if (action === 'install') {
      const response = await User.updateOne(
        { _id: user._id },
        { $set: { plugins: [...user.plugins, pluginKey] } },
      );
      return response;
    } else if (action === 'uninstall') {
      const response = await User.updateOne(
        { _id: user._id },
        { $set: { plugins: user.plugins.filter((plugin) => plugin !== pluginKey) } },
      );
      return response;
    }
  } catch (err) {
    console.log(err);
    return err;
  }
};

module.exports = { updateUserPluginsService };
