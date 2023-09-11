const { updateUserPluginsService } = require('../services/UserService');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('../services/PluginService');
const User = require('../../models/User');

const getUserController = async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId == undefined || userId === req.user.id) res.status(200).send(req.user);
    else {
      const user = await User.findById(userId).exec();
      const id = user._id;
      const name = user.name;
      const username = user.username;
      const followers = user.followers;
      const following = user.following;
      const biography = user.biography;
      res.status(200).send({ id, name, username, followers, following, biography });
    }
  } catch (error) {
    console.log(error);
    return { message: 'Error getting user' };
  }
};

// update biography
const postBiographyController = async (req, res) => {
  try {
    const { userId } = req.params;
    const { biography } = req.body;

    if (userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to update biography' });
    }

    const updatedFields = {};
    if (biography !== undefined) {
      updatedFields.biography = biography;
      // updatedFields.profession = profession;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updatedFields },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating biography' });
  }
};

// update User name
const usernameController = async (req, res) => {
  try {
    const { userId } = req.params;
    const { username } = req.body;

    if (userId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to update username' });
    }

    const updatedFields = {};
    if (username !== undefined) {
      updatedFields.username = username;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updatedFields },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    console.log('in controller', updatedUser)

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating biography' });
  }
};

const updateUserPluginsController = async (req, res) => {
  const { user } = req;
  const { pluginKey, action, auth } = req.body;
  let authService;
  try {
    const userPluginsService = await updateUserPluginsService(user, pluginKey, action);

    if (userPluginsService instanceof Error) {
      console.log(userPluginsService);
      const { status, message } = userPluginsService;
      res.status(status).send({ message });
    }
    if (auth) {
      const keys = Object.keys(auth);
      const values = Object.values(auth);
      if (action === 'install' && keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
          authService = await updateUserPluginAuth(user.id, keys[i], pluginKey, values[i]);
          if (authService instanceof Error) {
            console.log(authService);
            const { status, message } = authService;
            res.status(status).send({ message });
          }
        }
      }
      if (action === 'uninstall' && keys.length > 0) {
        for (let i = 0; i < keys.length; i++) {
          authService = await deleteUserPluginAuth(user.id, keys[i]);
          if (authService instanceof Error) {
            console.log(authService);
            const { status, message } = authService;
            res.status(status).send({ message });
          }
        }
      }
    }

    res.status(200).send();
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
};

const followUserController = async (req, res) => {
  try {
    const { user, isFollowing, otherUser } = req.body.arg;

    let dbResponse;
    const userUpdate = {};
    const otherUserUpdate = {};

    // Build the updates
    userUpdate[`following.${otherUser.id}`] = { name: otherUser.name, username: otherUser.username };
    otherUserUpdate[`followers.${user.id}`] = { name: user.name, username: user.username };

    // Updates to the DB
    if (isFollowing) {
      await User.findByIdAndUpdate(user.id, { $set: userUpdate }, { new: true, upsert: false });
      dbResponse = await User.findByIdAndUpdate(otherUser.id, { $set: otherUserUpdate }, { new: true, upsert: false });
    } else {
      await User.findByIdAndUpdate(user.id, { $unset: userUpdate }, { new: true, upsert: false });
      dbResponse = await User.findByIdAndUpdate(
        otherUser.id,
        { $unset: otherUserUpdate },
        { new: true, upsert: false }
      );
    }
    // Returns the updated profile page user
    const id = dbResponse._id;
    const name = dbResponse.name;
    const username = dbResponse.username;
    const followers = dbResponse.followers;
    const following = dbResponse.following;
    res.status(200).send({ id, name, username, followers, following });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  getUserController,
  updateUserPluginsController,
  followUserController,
  postBiographyController,
  usernameController
};
