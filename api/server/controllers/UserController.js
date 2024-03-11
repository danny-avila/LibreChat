const { updateUserPluginsService } = require('~/server/services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { logger } = require('~/config');
const { FileSources } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { resizeAvatar } = require('~/server/services/Files/images/avatar');
const User = require('~/models/User');

/**
 * Updates the avatar URL of an existing user. If the user's avatar URL does not include the query parameter
 * '?manual=true', it updates the user's avatar with the provided URL. For local file storage, it directly updates
 * the avatar URL, while for other storage types, it processes the avatar URL using the specified file strategy.
 *
 * @param {User} oldUser - The existing user object that needs to be updated.
 * @param {string} avatarUrl - The new avatar URL to be set for the user.
 *
 * @returns {Promise<void>}
 *          The function updates the user's avatar and saves the user object. It does not return any value.
 *
 * @throws {Error} Throws an error if there's an issue saving the updated user object.
 */
const handleExistingUser = async (oldUser, avatarUrl) => {
  const fileStrategy = process.env.CDN_PROVIDER;
  const isLocal = fileStrategy === FileSources.local;

  if (isLocal && (oldUser.avatar === null || !oldUser.avatar.includes('?manual=true'))) {
    oldUser.avatar = avatarUrl;
    await oldUser.save();
  } else if (!isLocal && (oldUser.avatar === null || !oldUser.avatar.includes('?manual=true'))) {
    const userId = oldUser._id;
    const webPBuffer = await resizeAvatar({
      userId,
      input: avatarUrl,
    });
    const { processAvatar } = getStrategyFunctions(fileStrategy);
    oldUser.avatar = await processAvatar({ buffer: webPBuffer, userId });
    await oldUser.save();
  }
};

/**
 * Creates a new user with the provided user details. If the file strategy is not local, the avatar URL is
 * processed using the specified file strategy. The new user is saved to the database with the processed or
 * original avatar URL.
 *
 * @param {Object} params - The parameters object for user creation.
 * @param {string} parmas.clerkUserId - Clerk userId of new user.
 * @param {string} params.email - The email of the new user.
 * @param {string} params.avatarUrl - The avatar URL of the new user.
 * @param {string} params.username - The username of the new user.
 * @param {string} params.name - The name of the new user.
 * @param {boolean} [params.emailVerified=false] - Optional. Indicates whether the user's email is verified. Defaults to false.
 *
 * @returns {Promise<User>}
 *          A promise that resolves to the newly created user object.
 *
 * @throws {Error} Throws an error if there's an issue creating or saving the new user object.
 */
const createNewUser = async ({ clerkUserId, email, avatarUrl, username, name, emailVerified }) => {
  //determine if this is the first registered user (not counting anonymous_user)
  const isFirstRegisteredUser = (await User.countDocuments({})) === 0;
  const update = {
    clerkUserId,
    email,
    avatar: avatarUrl,
    username,
    name,
    emailVerified,
    role: isFirstRegisteredUser ? 'ADMIN' : 'USER',
  };

  // TODO: remove direct access of User model
  const newUser = await new User(update).save();

  const fileStrategy = process.env.CDN_PROVIDER;
  const isLocal = fileStrategy === FileSources.local;

  if (!isLocal) {
    const userId = newUser._id;
    const webPBuffer = await resizeAvatar({
      userId,
      input: avatarUrl,
    });
    const { processAvatar } = getStrategyFunctions(fileStrategy);
    newUser.avatar = await processAvatar({ buffer: webPBuffer, userId });
    await newUser.save();
  }

  return newUser;
};

const getUserController = async (req, res) => {
  const user = await User.findOne({ id: req.user.id });
  res.status(200).send(user);
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

module.exports = {
  handleExistingUser,
  createNewUser,
  getUserController,
  updateUserPluginsController,
};
