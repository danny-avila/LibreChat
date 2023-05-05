const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const DebugControl = require('../utils/debug.js');

function log({ title, parameters }) {
  DebugControl.log.functionName(title);
  DebugControl.log.parameters(parameters);
}

const Session = mongoose.Schema({
  refreshToken: {
    type: String,
    default: ''
  }
});

const userSchema = mongoose.Schema(
  {
    name: {
      type: String
    },
    username: {
      type: String,
      lowercase: true,
      required: [true, "can't be blank"],
      match: [/^[a-zA-Z0-9_]+$/, 'is invalid'],
      index: true
    },
    email: {
      type: String,
      required: [true, "can't be blank"],
      lowercase: true,
      unique: true,
      match: [/\S+@\S+\.\S+/, 'is invalid'],
      index: true
    },
    emailVerified: {
      type: Boolean,
      required: true,
      default: false
    },
    password: {
      type: String,
      trim: true,
      minlength: 8,
      maxlength: 60
    },
    avatar: {
      type: String,
      required: false
    },
    provider: {
      type: String,
      required: true,
      default: 'local'
    },
    role: {
      type: String,
      default: 'USER'
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true
    },
    refreshToken: {
      type: [Session]
    }
  },
  { timestamps: true }
);

//Remove refreshToken from the response
userSchema.set('toJSON', {
  transform: function (doc, ret, options) {
    delete ret.refreshToken;
    return ret;
  }
});

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
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

const isProduction = process.env.NODE_ENV === 'production';
const secretOrKey = isProduction ? process.env.JWT_SECRET_PROD : process.env.JWT_SECRET_DEV;
const refreshSecret = isProduction
  ? process.env.REFRESH_TOKEN_SECRET_PROD
  : process.env.REFRESH_TOKEN_SECRET_DEV;

userSchema.methods.generateToken = function () {
  const token = jwt.sign(
    {
      id: this._id,
      username: this.username,
      provider: this.provider,
      email: this.email
    },
    secretOrKey,
    { expiresIn: eval(process.env.SESSION_EXPIRY) }
  );
  return token;
};

userSchema.methods.generateRefreshToken = function () {
  const refreshToken = jwt.sign(
    {
      id: this._id,
      username: this.username,
      provider: this.provider,
      email: this.email
    },
    refreshSecret,
    { expiresIn: eval(process.env.REFRESH_TOKEN_EXPIRY) }
  );
  return refreshToken;
};

userSchema.methods.comparePassword = function (candidatePassword, callback) {
  bcrypt.compare(candidatePassword, this.password, (err, isMatch) => {
    if (err) return callback(err);
    callback(null, isMatch);
  });
};

module.exports.hashPassword = async (password) => {

  const hashedPassword = await new Promise((resolve, reject) => {
    bcrypt.hash(password, 10, function (err, hash) {
      if (err) reject(err);
      else resolve(hash);
    });
  });

  return hashedPassword;
};

module.exports.validateUser = (user) => {
  log({
    title: 'Validate User',
    parameters: [{ name: 'Validate User', value: user }]
  });
  const schema = {
    avatar: Joi.any(),
    name: Joi.string().min(2).max(80).required(),
    username: Joi.string()
      .min(2)
      .max(80)
      .regex(/^[a-zA-Z0-9_]+$/)
      .required(),
    password: Joi.string().min(8).max(60).allow('').allow(null)
  };

  return Joi.validate(user, schema);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
