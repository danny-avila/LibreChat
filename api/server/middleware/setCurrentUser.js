const User = require('~/models/User');
const clerkClient = require('@clerk/clerk-sdk-node');
const { createNewUser } = require('~/server/controllers/UserController');

// Create a middleware function that sets the `req.user` property
const setCurrentUser = async (req, res, next) => {
  try {
    // Get the user from the database or another source
    let user;
    user = await User.findOne({ clerkUserId: req.auth.userId });
    if (user === null) {
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
        avtar: clerkUser.imageUrl,
      };
      try {
        user = await createNewUser(userData);
      } catch (error) {
        user = await User.findOne({ clerkUserId: req.auth.userId });
      }
    }
    // Set the `req.user` property
    req.user = user;
    // Call the next middleware function
    next();
  } catch (error) {
    console.log(error);
    return res.status(422).send({ error: 'Failed to get the user' });
  }
};

module.exports = setCurrentUser;
