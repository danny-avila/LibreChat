const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const signPayload = require('../server/services/signPayload');
const userSchema = require('./schema/userSchema.js');
const { SESSION_EXPIRY } = process.env ?? {};
const expires = eval(SESSION_EXPIRY) ?? 1000 * 60 * 15;

userSchema.methods.toJSON = function () {
  return {
    id: this._id,
    provider: this.provider,
    email: this.email,
    name: this.name,
    username: this.username,
    avatar: this.avatar,
    role: this.role,
    emailVerified: this.emailVerified,
    plugins: this.plugins,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
    lastTokenClaimTimestamp: this.lastTokenClaimTimestamp,
  };
};

userSchema.methods.generateToken = async function () {
  return await signPayload({
    payload: {
      id: this._id,
      username: this.username,
      provider: this.provider,
      email: this.email,
    },
    secret: process.env.JWT_SECRET,
    expirationTime: expires / 1000,
  });
};

userSchema.methods.comparePassword = function (candidatePassword, callback) {
  bcrypt.compare(candidatePassword, this.password, (err, isMatch) => {
    if (err) {
      return callback(err);
    }
    callback(null, isMatch);
  });
};

module.exports.hashPassword = async (password) => {
  const hashedPassword = await new Promise((resolve, reject) => {
    bcrypt.hash(password, 10, function (err, hash) {
      if (err) {
        reject(err);
      } else {
        resolve(hash);
      }
    });
  });

  return hashedPassword;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
