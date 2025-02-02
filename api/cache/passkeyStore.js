const { getUserById, findUser, createUser, updateUser } = require('~/models');

class MongoUserStore {
  async get(identifier, byID = false) {
    let user;
    if (byID) {
      user = await getUserById(identifier);
    } else {
      user = await findUser({ email: identifier });
    }
    if (user) {
      return {
        id: user._id.toString(),
        email: user.email,
        passkeys: user.passkeys,
      };
    }
    return undefined;
  }

  async save(user) {
    if (!user.id) {
      const createdUser = await createUser(
        {
          email: user.email,
          username: user.email,
          passkeys: user.passkeys,
        },
        /* disableTTL */ true,
        /* returnUser */ true,
      );
      return {
        id: createdUser._id.toString(),
        email: createdUser.email,
        passkeys: createdUser.passkeys,
      };
    } else {
      const updatedUser = await updateUser(user.id, {
        email: user.email,
        username: user.email,
        passkeys: user.passkeys,
      });
      if (!updatedUser) {
        throw new Error('Failed to update user');
      }
      return {
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        passkeys: updatedUser.passkeys,
      };
    }
  }
}

module.exports = MongoUserStore;