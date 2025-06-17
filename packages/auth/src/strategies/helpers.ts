import { IUser } from '@librechat/data-schemas';
import { FileSources } from 'librechat-data-provider';
import { getBalanceConfig, getMethods } from '../initAuth';
import { getAvatarProcessFunction, resizeAvatar } from '../utils/avatar';
import { CreateSocialUserParams } from './types';

/**
 * Updates the avatar URL of an existing user. If the user's avatar URL does not include the query parameter
 * '?manual=true', it updates the user's avatar with the provided URL. For local file storage, it directly updates
 * the avatar URL, while for other storage types, it processes the avatar URL using the specified file strategy.
 *
 * @param {MongoUser} oldUser - The existing user object that needs to be updated.
 * @param {string} avatarUrl - The new avatar URL to be set for the user.
 *
 * @returns {Promise<void>}
 *          The function updates the user's avatar and saves the user object. It does not return any value.
 *
 * @throws {Error} Throws an error if there's an issue saving the updated user object.
 */
const handleExistingUser = async (oldUser: IUser, avatarUrl: string) => {
  console.log(1111);
  const fileStrategy = process.env.CDN_PROVIDER ?? FileSources.local;
  const isLocal = fileStrategy === FileSources.local;

  let updatedAvatar = '';
  if (isLocal && (oldUser.avatar === null || !oldUser.avatar?.includes('?manual=true'))) {
    updatedAvatar = avatarUrl;
  } else if (!isLocal && (oldUser.avatar === null || !oldUser.avatar?.includes('?manual=true'))) {
    const userId = oldUser.id ?? '';
    const resizedBuffer = await resizeAvatar({
      userId,
      input: avatarUrl,
    });
    const processAvatar = getAvatarProcessFunction(fileStrategy);
    updatedAvatar = await processAvatar({ buffer: resizedBuffer, userId });
  }

  if (updatedAvatar != '') {
    const { updateUser } = getMethods();
    await updateUser(oldUser._id, { avatar: updatedAvatar });
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
const createSocialUser = async ({
  email,
  avatarUrl,
  provider,
  providerKey,
  providerId,
  username,
  name,
  emailVerified,
}: CreateSocialUserParams): Promise<IUser> => {
  const update = {
    email,
    avatar: avatarUrl,
    provider,
    [providerKey]: providerId,
    username,
    name,
    emailVerified,
  };
  const balanceConfig = getBalanceConfig();
  const { createUser, getUserById, updateUser } = getMethods();
  const newUserId = await createUser(update, balanceConfig);
  const fileStrategy = process.env.CDN_PROVIDER ?? FileSources.local;
  const isLocal = fileStrategy === FileSources.local;

  if (!isLocal) {
    const resizedBuffer = await resizeAvatar({
      userId: newUserId,
      input: avatarUrl,
    });
    const processAvatar = getAvatarProcessFunction(fileStrategy);
    const avatar = await processAvatar({ buffer: resizedBuffer, userId: newUserId });
    await updateUser(newUserId, { avatar });
  }

  return await getUserById(newUserId);
};
export { handleExistingUser, createSocialUser };
