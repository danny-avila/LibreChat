const User = require('../../models/User');

const updateUserPlugins = async (user, pluginKey, action) => {
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

const updateUser = async (user, update) => {
  try {
    const response = await User.updateOne(
      { _id: user._id },
      { $set: update }
    );  
    return response;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const deleteUser = async (user) => {
  try {
    const response = await User.deleteOne({ _id: user._id });
    return response;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const getAllUsers = async () => {
  try {
    const users = await User.find({});
    return users;
  } catch (err) {
    console.log(err);
    return err;
  }
};

module.exports = { getAllUsers, deleteUser, updateUser, updateUserPlugins };
