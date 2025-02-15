const User = require('~/models/User');

async function deleteUserController(req, res) {
  try {
    console.log(req.params.id);
    const findedUser = await User.findOne({ _id: req.params.id }).lean();

    if (!findedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const deleteUser = await User.deleteOne({ _id: req.params.id });

    return res.status(200).json({ message: 'User deleted successfully', user: deleteUser });
  } catch (error) {
    console.log('Error', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = deleteUserController;
