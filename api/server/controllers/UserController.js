const { updateUserPluginsService } = require('../services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('../services/PluginService');

const getUserController = async (req, res) => {
  res.status(200).send(req.user);
};

const updateUserPluginsController = async (req, res) => {
  const { user } = req;
  const { pluginKey, action, auth } = req.body;
  let authService;
  try {
    const userPluginsService = await updateUserPluginsService(user, pluginKey, action);
    
    if (userPluginsService instanceof Error ) {
      console.log(userPluginsService);
      const { status, message } = userPluginsService;
      res.status(status).send({ message });
    }
    const keys = Object.keys(auth);
    const values = Object.values(auth);

    if (auth) {
      if (action === 'install') {
        for(let i = 0; i < keys.length; i++) {
          authService = await updateUserPluginAuth(user.id, keys[i], pluginKey, values[i]);
          if (authService instanceof Error ) {
            console.log(authService);
            const { status, message } = authService;
            res.status(status).send({ message });
          }
        }
      }
      if (action === 'uninstall') {
        for(let i = 0; i < keys.length; i++) {
          authService = await deleteUserPluginAuth(user.id, keys[i]);
          if(authService instanceof Error ) {
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
}