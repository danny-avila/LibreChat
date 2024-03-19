const User = require('~/models/User');
const clerkClient = require('@clerk/clerk-sdk-node');
const { FileSources } = require('librechat-data-provider');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { resizeAvatar } = require('~/server/services/Files/images/avatar');

// Create a middleware function that sets the `req.user` property
const setCurrentUser = async (req, res, next) => {
  try {
    const externalId = req.auth.sessionClaims.user?.externalId;
    let newUser;
    if (!externalId) {
      const clerkUser = await clerkClient.users.getUser(req.auth.userId);
      const userData = {
        clerkUserId: clerkUser.id,
        name: `${
          clerkUser.firstName
            ? clerkUser.firstName + (clerkUser.lastName ? ' ' + clerkUser.lastName : '')
            : ''
        }`,
        email: clerkUser.emailAddresses.find((x) => x.id === clerkUser.primaryEmailAddressId)
          .emailAddress,
        emailVerified:
          clerkUser.emailAddresses.find((x) => x.id === clerkUser.primaryEmailAddressId)
            .verification.status === 'verified',
        username: clerkUser.username,
        avatar: clerkUser.imageUrl,
      };
      try {
        newUser = await new User(userData).save();
        const fileStrategy = process.env.CDN_PROVIDER;
        const isLocal = fileStrategy === FileSources.local;

        if (!isLocal) {
          const userId = newUser._id;
          const webPBuffer = await resizeAvatar({
            userId,
            input: newUser.avatar,
          });

          const { processAvatar } = getStrategyFunctions(fileStrategy);
          newUser.avatar = await processAvatar({ buffer: webPBuffer, userId });
          await newUser.save();
        }
      } catch (error) {
        newUser = await User.findOneAndUpdate(
          {
            email: clerkUser.emailAddresses.find((x) => x.id === clerkUser.primaryEmailAddressId)
              .emailAddress,
          },
          userData,
        );
      }
      await clerkClient.users.updateUser(req.auth.userId, {
        externalId: newUser._id,
      });
    }
    // Set the `req.user` property
    req.user = {
      id: externalId || newUser._id,
    };
    // Call the next middleware function
    next();
  } catch (error) {
    console.log(error);
    return res.status(422).send({ error: 'Failed to get the user' });
  }
};

module.exports = setCurrentUser;
