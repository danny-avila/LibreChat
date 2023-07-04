const { updateUserPlugins, getAllUsers, deleteUser, updateUser, createUser } = require('../services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('../services/PluginService');

const getUserController = async (req, res) => {
  res.status(200).send(req.user);
};

const getAllUsersController = async (req, res) => {
  try {
    const users = await getAllUsers();
    return res.status(200).json(users);
  } catch (e) {
    console.log(e);
    return res.status(500).json({ message: e.message });
  }
}

const createUserController = async (req, res) => {
  try {
    const { user } = req.body;
    const newUser = await createUser(user);
    return res.status(200).json(newUser);
  } catch (e) {
    console.log(e);
    return res.status(500).json({ message: e.message });
  }
}

const deleteUserController = async (req, res) => {
  try {
    const { user } = req.body;
    const del = await deleteUser(user.id);
    return res.status(200).json(del);
  } catch (e) {
    console.log(e);
    return res.status(500).json({ message: e.message });
  }
}

const updateUserController = async (req, res) => {
  try {
    const { user } = req.body;
    const update = await updateUser(user);
    return res.status(200).json(update);
  } catch (e) {
    console.log(e);
    return res.status(500).json({ message: e.message });
  }
}

const updateUserPluginsController = async (req, res) => {
  const { user } = req;
  const { pluginKey, action, auth } = req.body;
  let authService;
  try {
    const userPluginsService = await updateUserPlugins(user, pluginKey, action);

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
  updateUserPluginsController,
  updateUserController,
  getAllUsersController,
  deleteUserController,
  createUserController,
};
