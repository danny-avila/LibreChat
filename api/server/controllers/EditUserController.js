const User = require('~/models/User');
const bcrypt = require('bcryptjs');

async function editUserController(req, res) {
  try {
    const findedUser = await User.findOne({ _id: req.params.id }).lean();

    if (!findedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    let mergedObj;
    if (req.body.editedUser.password) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(req.body.editedUser.password, salt);

      mergedObj = Object.assign({}, findedUser, {
        ...req.body.editedUser,
        password: hashedPassword,
      });
    } else {
      mergedObj = Object.assign({}, findedUser, req.body.editedUser);
    }

    console.log('FINDED USER BY ID ===>', findedUser);
    console.log('EDITED USER FROM REQUEST ===>', req.body.editedUser);
    console.log('MERGED OBJECT ===>', mergedObj);

    const updatedUser = await User.updateOne({ _id: req.params.id }, { ...mergedObj });
    return res.status(200).json({ message: 'User edited successfully.', user: updatedUser });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json(error);
  }
}

module.exports = editUserController;
