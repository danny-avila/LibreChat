const { updateUserPluginsService } = require('~/server/services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const addTokensByUserId = require('../../../config/addTokens');
const { User } = require('~/models');
const { logger } = require('~/config');

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

const getUserLastTokenClaimTimestamp = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const lastTokenClaimTimestamp = user.lastTokenClaimTimestamp || 0;
    res.status(200).json({ lastTokenClaimTimestamp });
  } catch (err) {
    logger.error('[getUserLastTokenClaimTimestamp]', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const claimTokens = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const currentTimestamp = new Date();

    if (
      !user.lastTokenClaimTimestamp ||
      currentTimestamp - user.lastTokenClaimTimestamp >= 24 * 60 * 60 * 1000
    ) {
      // User is eligible to claim tokens
      const claimedTokens = 20000; // Number of tokens to claim

      try {
        const newBalance = await addTokensByUserId(user._id, claimedTokens);
        user.lastTokenClaimTimestamp = currentTimestamp;
        await user.save();
        return res
          .status(200)
          .json({ message: 'Tokens claimed successfully', balance: newBalance });
      } catch (error) {
        logger.error('[claimTokens] Error updating balance:', error);
        return res.status(500).json({ message: 'Failed to update balance' });
      }
    } else {
      // User is not eligible to claim tokens yet
      const remainingTime = 24 * 60 * 60 * 1000 - (currentTimestamp - user.lastTokenClaimTimestamp);
      const hours = Math.floor(remainingTime / (60 * 60 * 1000));
      const minutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((remainingTime % (60 * 1000)) / 1000);

      return res.status(400).json({
        message: `Not eligible to claim tokens yet. Please wait ${hours} hours, ${minutes} minutes, and ${seconds} seconds.`,
      });
    }
  } catch (err) {
    logger.error('[claimTokens]', err);
    return res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getUserController,
  updateUserPluginsController,
  getUserLastTokenClaimTimestamp,
  claimTokens,
};
