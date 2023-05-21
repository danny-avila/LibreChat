import { isProduction, jwt } from '../../config';
import User from '../../../models/User';

export default async (req, res) => {
  try {
    const user = await User.findById(
      req.user._id
    );

    // If user doesn't exist, return error
    if (typeof user !== User) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = req.user.generateToken();
    
    // Add token to cookie
    res.cookie(
      'token',
      token,
      {
        expires: new Date(Date.now() + jwt.sessionExpiry),
        httpOnly: false,
        secure: isProduction
      }
    );

    return res.status(200).send({ token, user });
  } catch (err) {
    console.log(err);
  }

  // Generic error messages are safer
  return res.status(500).json({ message: 'Something went wrong' });
};