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
    const resizedBuffer = await resizeAvatar({
      userId,
      input: avatarUrl,
    });
    const { processAvatar } = getStrategyFunctions(fileStrategy);
    oldUser.avatar = await processAvatar({ buffer: resizedBuffer, userId });
    await oldUser.save();
  }
};

/**
 * Creates a new user with the provided user details. If the file strategy is not local, the avatar URL is
 * processed using the specified file strategy. The new user is saved to the database with the processed or
 * original avatar URL.
 *
 * @param {Object} params - The parameters object for user creation.
 * @param {string} params.email - The email of the new user.
 * @param {string} params.avatarUrl - The avatar URL of the new user.
 * @param {string} params.provider - The provider of the user's account.
 * @param {string} params.providerKey - The key to identify the provider in the user model.
 * @param {string} params.providerId - The provider-specific ID of the user.
 * @param {string} params.username - The username of the new user.
 * @param {string} params.name - The name of the new user.
 * @param {boolean} [params.emailVerified=false] - Optional. Indicates whether the user's email is verified. Defaults to false.
 *
 * @returns {Promise<User>}
 *          A promise that resolves to the newly created user object.
 *
 * @throws {Error} Throws an error if there's an issue creating or saving the new user object.
 */
const createNewUser = async ({
  email,
  avatarUrl,
  provider,
  providerKey,
  providerId,
  username,
  name,
  emailVerified,
}) => {
  const update = {
    email,
    avatar: avatarUrl,
    provider,
    [providerKey]: providerId,
    username,
    name,
    emailVerified,
  };

  // TODO: remove direct access of User model
  const newUser = await new User(update).save();

  const fileStrategy = process.env.CDN_PROVIDER;
  const isLocal = fileStrategy === FileSources.local;

  if (!isLocal) {
    const userId = newUser._id;
    const resizedBuffer = await resizeAvatar({
      userId,
      input: avatarUrl,
    });
    const { processAvatar } = getStrategyFunctions(fileStrategy);
    newUser.avatar = await processAvatar({ buffer: resizedBuffer, userId });
    await newUser.save();
  }

  return newUser;
};

module.exports = {
  handleExistingUser,
  createNewUser,
};
