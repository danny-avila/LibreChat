const User = require('~/models/User');

async function getUsersController(req, res) {
  try {
    const users = await User.find().lean()
    console.log('users:' ,users)
    return res.status(200).json(users);
  } catch (error) {
    console.error('Error', error);
    return res.status(500).json({message: "Internal server error"})
  }
}

module.exports = getUsersController;
