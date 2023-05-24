const User = require('../../models/User');
const Token = require('../../models/schema/tokenSchema');
const sendEmail = require('../../utils/sendEmail');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const DebugControl = require('../../utils/debug.js');
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
  try {
    const userFound = await User.findById(user._id);
    const tokenIndex = userFound.refreshToken.findIndex((item) => item.refreshToken === refreshToken);

    if (tokenIndex !== -1) {
      userFound.refreshToken.id(userFound.refreshToken[tokenIndex]._id).remove();
    }

    await userFound.save();
    //res.clearCookie('refreshToken', COOKIE_OPTIONS);
    // removeTokenCookie(res);
    return { status: 200, message: 'Logout successful' };
  } catch (err) {
    return { status: 500, message: err.message };
  }
}

const registerUser = async (user) => {
  let response = {};
  const { error } = registerSchema.validate(user);
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
    const isFirstRegisteredUser = (await User.countDocuments({})) === 0;

    try {
      const newUser = await new User({
        provider: 'local',
        email,
        password,
        username,
        name,
        avatar: null,
        role: isFirstRegisteredUser ? 'ADMIN' : 'USER'
      });

      // todo: implement refresh token
      // const refreshToken = newUser.generateRefreshToken();
      // newUser.refreshToken.push({ refreshToken });
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(newUser.password, salt);
      newUser.password = hash;
      newUser.save();

      if (isFirstRegisteredUser) {
        migrateDataToFirstUser(newUser);
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
  const hash = await bcrypt.hashSync(resetToken, 10);

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

  const isValid = bcrypt.compareSync(token, passwordResetToken.token);

  if (!isValid) {
    return new Error('Invalid or expired password reset token');
  }

  const hash = bcrypt.hashSync(password, 10);

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
  resetPassword
};
