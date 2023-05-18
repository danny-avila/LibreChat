const {
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resetPassword
} = require('../services/auth.service');

const isProduction = process.env.NODE_ENV === 'production';

const loginController = async (req, res) => {
  try {
    const token = req.user.generateToken();
    const user = await loginUser(req.user);
    if (user) {
      res.cookie('token', token, {
        expires: new Date(Date.now() + eval(process.env.SESSION_EXPIRY)),
        httpOnly: false,
        secure: isProduction
      });
      res.status(200).send({ token, user });
    } else {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: err.message });
  }
};

const logoutController = async (req, res) => {
  const { signedCookies = {} } = req;
  const { refreshToken } = signedCookies;
  try {
    const logout = await logoutUser(req.user, refreshToken);
    console.log(logout);
    const { status, message } = logout;
    if (status === 200) {
      res.clearCookie('token');
      res.clearCookie('refreshToken');
      res.status(status).send({ message });
    } else {
      res.status(status).send({ message });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: err.message });
  }
};

const registrationController = async (req, res) => {
  try {
    const response = await registerUser(req.body);
    if (response.status === 200) {
      const { status, user } = response;
      const token = user.generateToken();
      //send token for automatic login
      res.cookie('token', token, {
        expires: new Date(Date.now() + eval(process.env.SESSION_EXPIRY)),
        httpOnly: false,
        secure: isProduction
      });
      res.status(status).send({ user });
    } else {
      const { status, message } = response;
      res.status(status).send({ message });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: err.message });
  }
};

const getUserController = async (req, res) => {
  return res.status(200).send(req.user);
};

const resetPasswordRequestController = async (req, res) => {
  try {
    const resetService = await requestPasswordReset(req.body.email);
    if (resetService.link) {
      return res.status(200).json(resetService);
    } else {
      return res.status(400).json(resetService);
    }
  } catch (e) {
    console.log(e);
    return res.status(400).json({ message: e.message });
  }
};

const resetPasswordController = async (req, res) => {
  try {
    const resetPasswordService = await resetPassword(
      req.body.userId,
      req.body.token,
      req.body.password
    );
    if (resetPasswordService instanceof Error) {
      return res.status(400).json(resetPasswordService);
    } else {
      return res.status(200).json(resetPasswordService);
    }
  } catch (e) {
    console.log(e);
    return res.status(400).json({ message: e.message });
  }
};

const refreshController = async (req, res, next) => {
  const { signedCookies = {} } = req;
  const { refreshToken } = signedCookies;
  //TODO
  // if (refreshToken) {
  //   try {
  //     const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  //     const userId = payload._id;
  //     User.findOne({ _id: userId }).then(
  //       (user) => {
  //         if (user) {
  //           // Find the refresh token against the user record in database
  //           const tokenIndex = user.refreshToken.findIndex(item => item.refreshToken === refreshToken);

  //           if (tokenIndex === -1) {
  //             res.statusCode = 401;
  //             res.send('Unauthorized');
  //           } else {
  //             const token = req.user.generateToken();
  //             // If the refresh token exists, then create new one and replace it.
  //             const newRefreshToken = req.user.generateRefreshToken();
  //             user.refreshToken[tokenIndex] = { refreshToken: newRefreshToken };
  //             user.save((err) => {
  //               if (err) {
  //                 res.statusCode = 500;
  //                 res.send(err);
  //               } else {
  //               //  setTokenCookie(res, newRefreshToken);
  //                 const user = req.user.toJSON();
  //                 res.status(200).send({ token, user });
  //               }
  //             });
  //           }
  //         } else {
  //           res.statusCode = 401;
  //           res.send('Unauthorized');
  //         }
  //       },
  //       err => next(err)
  //     );
  //   } catch (err) {
  //     res.statusCode = 401;
  //     res.send('Unauthorized');
  //   }
  // } else {
  //   res.statusCode = 401;
  //   res.send('Unauthorized');
  // }
};

module.exports = {
  getUserController,
  loginController,
  logoutController,
  refreshController,
  registrationController,
  resetPasswordRequestController,
  resetPasswordController
};
