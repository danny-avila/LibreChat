const User = require('../../models/User');
const Token = require('../../models/schema/tokenSchema');
const sendEmail = require('../../utils/sendEmail');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const DebugControl = require('../../utils/debug.js');
const Joi = require('joi');
const { registerSchema } = require('../../strategies/validators');
const migrateDataToFirstUser = require('../../utils/migrateDataToFirstUser');

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  DebugControl.log.parameters(parameters);
}

const isProduction = process.env.NODE_ENV === 'production';
const clientUrl = isProduction ? process.env.CLIENT_URL_PROD : process.env.CLIENT_URL_DEV;

const loginUser = async (user) => {
  // const refreshToken = req.user.generateRefreshToken();
  const dbUser = await User.findById(user._id);
  //todo: save refresh token

  return dbUser;
};

const logoutUser = async (user, refreshToken) => {
  User.findById(user._id).then((user) => {
    const tokenIndex = user.refreshToken.findIndex(item => item.refreshToken === refreshToken);

    if (tokenIndex !== -1) {
      user.refreshToken.id(user.refreshToken[tokenIndex]._id).remove();
    }

    user.save((err) => {
      if (err) {
        return { status: 500, message: err.message };
      } else {
        //res.clearCookie('refreshToken', COOKIE_OPTIONS);
        // removeTokenCookie(res);
        return { status: 200, message: 'Logout successful' };
      }
    });
  });
  return { status: 200, message: 'Logout successful' };
};

const registerUser = async (user) => {
  let response = {};
  const { error } = Joi.validate(user, registerSchema);
  if (error) {
    log({
      title: 'Route: register - Joi Validation Error',
      parameters: [
        { name: 'Request params:', value: user },
        { name: 'Validation error:', value: error.details }
      ]
    });
    response = { status: 422, message: error.details[0].message };
    return response;
  }

  const { email, password, name, username } = user;

  try {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      log({
        title: 'Register User - Email in use',
        parameters: [
          { name: 'Request params:', value: user },
          { name: 'Existing user:', value: existingUser }
        ]
      });
      response = { status: 422, message: 'Email is in use' };
      return response;
    }

    //determine if this is the first registered user (not counting anonymous_user)
    const isFirstRegisteredUser = await User.countDocuments({}) === 0;

    try {
      const newUser = await new User({
        provider: 'email',
        email,
        password,
        username,
        name,
        avatar: null,
        role: isFirstRegisteredUser ? 'ADMIN' : 'USER',
      });

      // todo: implement refresh token
      // const refreshToken = newUser.generateRefreshToken();
      // newUser.refreshToken.push({ refreshToken });
      bcrypt.genSalt(10, (err, salt) => {
        bcrypt.hash(newUser.password, salt, (errh, hash) => {
          if (err) {
            console.log(err);
          }
          // set pasword to hash
          newUser.password = hash;
          newUser.save();
        });
      });
      console.log('newUser', newUser)
      if (isFirstRegisteredUser) {
        migrateDataToFirstUser(newUser);
        // console.log(migrate);
      }
      response = { status: 200, user: newUser };
      return response;
    } catch (err) {
      response = { status: 500, message: err.message };
      return response;
    }
  } catch (err) {
    response = { status: 500, message: err.message };
    return response;
  }
};

const requestPasswordReset = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    return new Error('Email does not exist');
  }

  let token = await Token.findOne({ userId: user._id });
  if (token) await token.deleteOne();

  let resetToken = crypto.randomBytes(32).toString('hex');
  const hash = await bcrypt.hash(resetToken, 10);

  await new Token({
    userId: user._id,
    token: hash,
    createdAt: Date.now()
  }).save();

  const link = `${clientUrl}/reset-password?token=${resetToken}&userId=${user._id}`;

  sendEmail(
    user.email,
    'Password Reset Request',
    {
      name: user.name,
      link: link
    },
    './template/requestResetPassword.handlebars'
  );
  return { link };
};

const resetPassword = async (userId, token, password) => {
  let passwordResetToken = await Token.findOne({ userId });

  if (!passwordResetToken) {
    return new Error('Invalid or expired password reset token');
  }

  const isValid = await bcrypt.compare(token, passwordResetToken.token);

  if (!isValid) {
    return new Error('Invalid or expired password reset token');
  }

  const hash = await bcrypt.hash(password, 10);

  await User.updateOne({ _id: userId }, { $set: { password: hash } }, { new: true });

  const user = await User.findById({ _id: userId });

  sendEmail(
    user.email,
    'Password Reset Successfnodeully',
    {
      name: user.name
    },
    './template/resetPassword.handlebars'
  );

  await passwordResetToken.deleteOne();

  return { message: 'Password reset was successful' };
};


module.exports = {
  // signup,
  registerUser,
  loginUser,
  logoutUser,
  requestPasswordReset,
  resetPassword,
};
