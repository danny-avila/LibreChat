const User = require('../../../models/User');

const loginController = async (req, res) => {
  try {
    const user = await User.findById(
      req.user._id
    );

    // If user doesn't exist, return error
    if (!user) { // typeof user !== User) { // this doesn't seem to resolve the User type ??
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = req.user.generateToken();
    const expires = eval(process.env.SESSION_EXPIRY);

    // Add token to cookie
    res.cookie(
      'token',
      token,
      {
        expires: new Date(Date.now() + expires),
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production'
      }
    );

    return res.status(200).send({ token, user });
  } catch (err) {
    console.log(err);
  }

  // Generic error messages are safer
  return res.status(500).json({ message: 'Something went wrong' });
};

module.exports = {
  loginController
};