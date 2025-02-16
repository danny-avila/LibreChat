const User = require('~/models/User');

async function editUserController(req, res) {
    console.log('editUserController was called'); 
  try {
    return res.status(200).json('done');
  } catch (error) {
    console.log('why error');
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = editUserController;
