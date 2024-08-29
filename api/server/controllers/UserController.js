const {
  Session,
  Balance,
  getFiles,
  deleteFiles,
  deleteConvos,
  deletePresets,
  deleteMessages,
  deleteUserById,
  getUsersByPage,
  findUser,
} = require('~/models');

const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { updateUserPluginsService, deleteUserKey } = require('~/server/services/UserService');
const { verifyEmail, resendVerificationEmail } = require('~/server/services/AuthService');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { deleteAllSharedLinks } = require('~/models/Share');
const { Transaction } = require('~/models/Transaction');
const { logger } = require('~/config');

const getUserController = async (req, res) => {
  res.status(200).send(req.user);
};

const getUsersController = async (req, res) => {
  let pageNumber = req.query.pageNumber || 1;
  pageNumber = parseInt(pageNumber, 10);

  if (isNaN(pageNumber) || pageNumber < 1) {
    return res.status(400).json({ error: 'Invalid page number' });
  }

  let pageSize = req.query.pageSize || 25;
  pageSize = parseInt(pageSize, 10);

  if (isNaN(pageSize) || pageSize < 1) {
    return res.status(400).json({ error: 'Invalid page size' });
  }

  let searchKey = req.query.searchKey;

  res.status(200).send(await getUsersByPage(pageNumber, pageSize, searchKey));
};

const deleteUserFiles = async (req) => {
  try {
    const userFiles = await getFiles({ user: req.user.id });
    await processDeleteRequest({
      req,
      files: userFiles,
    });
  } catch (error) {
    logger.error('[deleteUserFiles]', error);
  }
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
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const deleteUserController = async (req, res) => {
  const { user } = req;

  try {
    await deleteMessages({ user: user.id }); // delete user messages
    await Session.deleteMany({ user: user.id }); // delete user sessions
    await Transaction.deleteMany({ user: user.id }); // delete user transactions
    await deleteUserKey({ userId: user.id, all: true }); // delete user keys
    await Balance.deleteMany({ user: user._id }); // delete user balances
    await deletePresets(user.id); // delete user presets
    /* TODO: Delete Assistant Threads */
    await deleteConvos(user.id); // delete user convos
    await deleteUserPluginAuth(user.id, null, true); // delete user plugin auth
    await deleteUserById(user.id); // delete user
    await deleteAllSharedLinks(user.id); // delete user shared links
    await deleteUserFiles(req); // delete user files
    await deleteFiles(null, user.id); // delete database files in case of orphaned files from previous steps
    /* TODO: queue job for cleaning actions and assistants of non-existant users */
    logger.info(`User deleted account. Email: ${user.email} ID: ${user.id}`);
    res.status(200).send({ message: 'User deleted' });
  } catch (err) {
    logger.error('[deleteUserController]', err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const deleteUserByEmailController = async (req, res) => {
  const email = req.body.email;
  console.log('当前用户', req.user);
  console.log('删除用户', req.body);
  // 查找根据id查找用户
  const user = await findUser({ email });
  if (user) {
    console.log('找到用户', user);
    try {
      await deleteMessages({ user: user._id }); // delete user messages
      await Session.deleteMany({ user: user._id }); // delete user sessions
      await Transaction.deleteMany({ user: user._id }); // delete user transactions
      await deleteUserKey({ userId: user.id, all: true }); // delete user keys
      await Balance.deleteMany({ user: user._id }); // delete user balances
      await deletePresets(user._id); // delete user presets
      /* TODO: Delete Assistant Threads */
      await deleteConvos(user._id); // delete user convos
      await deleteUserPluginAuth(user._id, null, true); // delete user plugin auth
      await deleteUserById(user._id); // delete user
      await deleteAllSharedLinks(user._id); // delete user shared links
      // await deleteUserFiles(req); // delete user files
      await deleteFiles(null, user._id); // delete database files in case of orphaned files from previous steps
      /* TODO: queue job for cleaning actions and assistants of non-existant users */
      logger.info(`User deleted account. Email: ${user.email} ID: ${user._id}`);
      res.status(200).send(true);
    } catch (err) {
      logger.error('[deleteUserController]', err);
      return res.status(500).json(false);
    }
  } else {
    res.status(500).json(false);
  }
};

const verifyEmailController = async (req, res) => {
  try {
    const verifyEmailService = await verifyEmail(req);
    if (verifyEmailService instanceof Error) {
      return res.status(400).json(verifyEmailService);
    } else {
      return res.status(200).json(verifyEmailService);
    }
  } catch (e) {
    logger.error('[verifyEmailController]', e);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const resendVerificationController = async (req, res) => {
  try {
    const result = await resendVerificationEmail(req);
    if (result instanceof Error) {
      return res.status(400).json(result);
    } else {
      return res.status(200).json(result);
    }
  } catch (e) {
    logger.error('[verifyEmailController]', e);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

module.exports = {
  getUserController,
  getUsersController,
  deleteUserController,
  verifyEmailController,
  updateUserPluginsController,
  resendVerificationController,
  deleteUserByEmailController,
};
