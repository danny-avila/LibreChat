const { updateUserPluginsService } = require('~/server/services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { logger } = require('~/config');
const UserModel = require('~/models/User');
const TipTrackModel = require('~/models/schema/tipTrackSchema');

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
    const user = await UserModel.findById(req.user._id);
    if (user.karma < karma) {
      return res.status(403).json({ success: false, message: 'Insufficient Karma Points available. Subscribe today for an instant boost of 100 points to share with fellow ChatG members.' });
    }
    await UserModel.findByIdAndUpdate(userId, { $inc: { karma } }, { new: true });
    await UserModel.findByIdAndUpdate(req.user._id, { $inc: { karma: -karma } }, { new: true });
    await new TipTrackModel({
      sender: req.user._id,
      recipient: userId,
      sendType: 'karma',
      karma,
      convoId: req.body.convoId,
    }).save();
    res.json({ success: true });
  } catch (error) {
    return res.status(500).json(error);
  }
};

const copyCryptoAddress = async (req, res) => {
  console.log(req.body);
  try {
    const result = await new TipTrackModel({
      sender: req.user._id,
      recipient: req.body.recipient,
      network: req.body.network,
      convoId: req.body.convoId,
    }).save();

    return res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const getTipTrack = async (req, res) => {
  try {
    let result = await TipTrackModel.find({
      recipient: req.user._id,
      status: 'Pending',
    }).populate('sender');

    result = result.filter(i => req.user.mutes.filter( item => item !== i.sender._id ).length === 0);
    return res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const deleteTip = async (req, res) => {
  try {
    const result = await TipTrackModel.findByIdAndDelete(req.params.id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const confirmCryptoTip = async (req, res) => {
  const { trxId } = req.body;

  try {
    const result = await TipTrackModel.findOneAndUpdate(
      { _id: trxId, recipient: req.user._id },
      {
        status: 'Confirmed',
      },
      { new: true },
    );
    return res.json(result);
  } catch (error) {
    return res.status(500).json(error);
  }
};

const muteUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await UserModel.findById(req.user._id);
    if (user.mutes.indexOf(userId) > -1) {
      // user.mutes = user.mutes.filter(i => i !== userId);
    } else {
      user.mutes.push(userId);
    }
    const result = await user.save();
    return res.json(result);
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
};

module.exports = {
  getUserController,
  updateUserPluginsController,
  saveCryptoAdresses,
  sendKarma,
  copyCryptoAddress,
  confirmCryptoTip,
  getTipTrack,
  deleteTip,
  muteUser,
};
