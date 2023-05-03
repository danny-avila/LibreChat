const JWT = require("jsonwebtoken");
const User = require("../../models/User");
const Token = require("../../models/schema/tokenSchema");
const sendEmail = require("../../utils/sendEmail");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const JWTSecret = process.env.JWT_SECRET;

const isProduction = process.env.NODE_ENV === 'production';
const clientUrl = isProduction ? process.env.CLIENT_URL_PROD : process.env.CLIENT_URL_DEV;


// const signup = async (data) => {
//   let user = await User.findOne({ email: data.email });
//   if (user) {
//     throw new Error("Email already exist", 422);
//   }
//   user = new User(data);
//   const token = JWT.sign({ id: user._id }, JWTSecret);
//   await user.save();

//   return (data = {
//     userId: user._id,
//     email: user.email,
//     name: user.name,
//     token: token,
//   });
// };

const requestPasswordReset = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    return new Error("Email does not exist");
  }

  let token = await Token.findOne({ userId: user._id });
  if (token) await token.deleteOne();

  let resetToken = crypto.randomBytes(32).toString("hex");
  const hash = await bcrypt.hash(resetToken, 10);

  await new Token({
    userId: user._id,
    token: hash,
    createdAt: Date.now(),
  }).save();

  const link = `${clientUrl}/reset-password?token=${resetToken}&userId=${user._id}`;

  sendEmail(
    user.email,
    "Password Reset Request",
    {
      name: user.name,
      link: link,
    },
    "./template/requestResetPassword.handlebars"
  );
  return { link };
};

const resetPassword = async (userId, token, password) => {
  let passwordResetToken = await Token.findOne({ userId });

  if (!passwordResetToken) {
    return new Error("Invalid or expired password reset token");
  }

  const isValid = await bcrypt.compare(token, passwordResetToken.token);

  if (!isValid) {
    return new Error("Invalid or expired password reset token");
  }

  const hash = await bcrypt.hash(password, 10);

  await User.updateOne(
    { _id: userId },
    { $set: { password: hash } },
    { new: true }
  );

  const user = await User.findById({ _id: userId });

  sendEmail(
    user.email,
    "Password Reset Successfnodeully",
    {
      name: user.name,
    },
    "./template/resetPassword.handlebars"
  );

  await passwordResetToken.deleteOne();

  return { message: "Password reset was successful" };
};

module.exports = {
  // signup,
  requestPasswordReset,
  resetPassword,
};