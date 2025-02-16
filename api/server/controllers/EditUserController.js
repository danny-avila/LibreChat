const User = require('~/models/User');

async function editUserController(req, res) {

  try {
    const findedUser = await User.findOne({ _id: req.params.id }).lean();

    if (!findedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const mergedObj = Object.assign({}, findedUser, req.body.editedUser);

    console.log('FINDED USER BY ID ===>', findedUser);
    console.log('EDITED USER FROM REQUEST ===>', req.body.editedUser);
    console.log('MERGED OBJECT ===>', mergedObj);


    const result = await User.updateOne(
      { _id: req.params.id }, 
      { ...mergedObj },
    );
    return res.status(200).json(result);
  } catch (error) {
    console.log('why error');
    return res.status(500).json(error);
  }
}

module.exports = editUserController;
