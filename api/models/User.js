const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const DebugControl = require('../utils/debug.js');
const userSchema = require('./schema/userSchema.js');
const { SESSION_EXPIRY } = process.env ?? {};
const expires = eval(SESSION_EXPIRY) ?? 1000 * 60 * 15;

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  DebugControl.log.parameters(parameters);
}

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
  };
};

userSchema.methods.generateToken = function () {
  const token = jwt.sign(
    {
      id: this._id,
      username: this.username,
      provider: this.provider,
      email: this.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: expires / 1000 },
  );
  return token;
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

module.exports.validateUser = (user) => {
  log({
    title: 'Validate User',
    parameters: [{ name: 'Validate User', value: user }],
  });
  const schema = {
    avatar: Joi.any(),
    name: Joi.string().min(3).max(80).required(),
    username: Joi.string()
      .trim()
      .allow('')
      .min(2)
      .max(80)
      .regex(/^[a-zA-Z0-9_.-@#$%&*() ]+$/),
    password: Joi.string().min(8).max(128).allow('').allow(null),
  };

  return schema.validate(user);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
