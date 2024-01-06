const { updateUserPluginsService } = require('~/server/services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { logger } = require('~/config');
const {
  deleteMessages,
  deleteConvos,
  User,
  Session,
  Balance,
  Transaction,
} = require('@librechat/backend/models');

const getUserController = async (req, res) => {
  res.status(200).send(req.user);
};

const updateUserPluginsController = async (req, res) => {
  const { user } = req;
  const { pluginKey, action, auth } = req.body;
  let authService;
  try {
    const userPluginsService = await updateUserPluginsService(user, pluginKey, action);

    if (userPluginsService instanceof Error) {
      logger.error('[userPluginsService]', userPluginsService);
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
            logger.error('[authService]', authService);
            const { status, message } = authService;
            res.status(status).send({ message });
          }
        }
      }
      if (action === 'uninstall' && keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
          authService = await deleteUserPluginAuth(user.id, keys[i]);
          if (authService instanceof Error) {
            logger.error('[authService]', authService);
            const { status, message } = authService;
            res.status(status).send({ message });
          }
        }
      }
    }

    res.status(200).send();
  } catch (err) {
    logger.error('[updateUserPluginsController]', err);
    res.status(500).json({ message: err.message });
  }
};

const deleteUserController = async (req, res) => {
  console.log('user.js');
  const { user } = req;
  try {
    await user.deleteOne({ _id: user._id });
    await deleteConvos(user, {});
    await deleteMessages({ user });
    await Session.deleteAllUserSessions(user);
    await User.deleteMany({ _id: user });
    await Balance.deleteMany({ user });
    await Transaction.deleteMany({ user });
    res.status(200).send({ message: 'User deleted' });
  } catch (err) {
    logger.error('[deleteUserController]', err);
    res.status(500).send({ message: err.message });
  }
};

module.exports = {
  getUserController,
  updateUserPluginsController,
  deleteUserController,
};
