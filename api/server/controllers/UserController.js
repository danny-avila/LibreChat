const { updateUserPluginsService } = require('../services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('../services/PluginService');
const User = require('../../models/User');

const getUserController = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId == undefined || userId === req.user.id) res.status(200).send(req.user);
    else {
      const user = await User.findById(userId).exec();
      const id = user._id;
      const name = user.name;
      const username = user.username;
      res.status(200).send({ id, name, username });
    }
  } catch (error) {
    console.log(error);
    return { message: 'Error getting user' };
  }
};

const updateUserPluginsController = async (req, res) => {
  const { user } = req;
  const { pluginKey, action, auth } = req.body;
  let authService;
  try {
    const userPluginsService = await updateUserPluginsService(user, pluginKey, action);

    if (userPluginsService instanceof Error) {
      console.log(userPluginsService);
      const { status, message } = userPluginsService;
      res.status(status).send({ message });
    }
    if (auth) {
      const keys = Object.keys(auth);
      const values = Object.values(auth);
      if (action === 'install' && keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
          authService = await updateUserPluginAuth(user.id, keys[i], pluginKey, values[i]);
          if (authService instanceof Error) {
            console.log(authService);
            const { status, message } = authService;
            res.status(status).send({ message });
          }
        }
      }
      if (action === 'uninstall' && keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
          authService = await deleteUserPluginAuth(user.id, keys[i]);
          if (authService instanceof Error) {
            console.log(authService);
            const { status, message } = authService;
            res.status(status).send({ message });
          }
        }
      }
    }

    res.status(200).send();
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getUserController,
  updateUserPluginsController
};
