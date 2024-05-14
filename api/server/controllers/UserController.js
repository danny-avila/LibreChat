const { updateUserPluginsService } = require('~/server/services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { logger } = require('~/config');
const UserModel = require('~/models/User');

const getUserController = async (req, res) => {
  res.status(200).send(req.user);
};

const updateUserPluginsController = async (req, res) => {
  const { user } = req;
  const { pluginKey, action, auth, isAssistantTool } = req.body;
  let authService;
  try {
    if (!isAssistantTool) {
      const userPluginsService = await updateUserPluginsService(user, pluginKey, action);

      if (userPluginsService instanceof Error) {
        logger.error('[userPluginsService]', userPluginsService);
        const { status, message } = userPluginsService;
        res.status(status).send({ message });
      }
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

const saveCryptoAdresses = async (req, res) => {
  const { cryptocurrency } = req.body;
  try {
    const result = await UserModel.findByIdAndUpdate(
      req.user._id,
      { cryptocurrency },
      { new: true },
    );
    return res.json({ cryptocurrency: result.cryptocurrency });
  } catch (error) {
    return res.status(500).json(error);
  }
};

const sendKarma = async (req, res) => {
  const { karma, userId } = req.body;
  try {
    await UserModel.findByIdAndUpdate(userId, { $inc: { karma } }, { new: true });
    await UserModel.findByIdAndUpdate(req.user._id, { $dec: { karma } }, { new: true });
    res.json({ success: true });
  } catch (error) {
    return res.status(500).json(error);
  }
};

module.exports = {
  getUserController,
  updateUserPluginsController,
  saveCryptoAdresses,
  sendKarma,
};
