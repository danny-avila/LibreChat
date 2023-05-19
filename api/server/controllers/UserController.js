const { updateUserPluginsService } = require('../services/UserService');

const getUserController = async (req, res) => {
  res.status(200).send(req.user);
};

const updateUserPluginsController = async (req, res) => {
  const { user } = req;
  const { pluginKey, action } = req.body;
  try {
    const response = await updateUserPluginsService(user, pluginKey, action);
    if (response instanceof Error) {
      console.log(response);
      const { status, message } = response;
      res.status(status).send({ message });
    } else {
      res.status(200).send();
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getUserController,
  updateUserPluginsController
};
