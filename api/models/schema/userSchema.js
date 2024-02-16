const mongoose = require('mongoose');

const Session = mongoose.Schema({
  refreshToken: {
    type: String,
    default: '',
  },
});

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
    },
    username: {
      type: String,
      lowercase: true,
      default: '',
    },
    email: {
      type: String,
      required: [true, 'can\'t be blank'],
      lowercase: true,
      unique: true,
      match: [/\S+@\S+\.\S+/, 'is invalid'],
      index: true,
    },
    emailVerified: {
      type: Boolean,
      required: true,
      default: false,
    },
    password: {
      type: String,
      trim: true,
      minlength: 8,
      maxlength: 128,
    },
    avatar: {
      type: String,
      required: false,
    },
    provider: {
      type: String,
      required: true,
      default: 'local',
    },
    role: {
      type: String,
      default: 'USER',
    },
    googleId: {
      type: String,
    },
    facebookId: {
      type: String,
    },
    openidId: {
      type: String,
    },
    githubId: {
      type: String,
    },
    discordId: {
      type: String,
    },
    plugins: {
      type: Array,
      default: [],
    },
    refreshToken: {
      type: [Session],
    },
  },
  { timestamps: true },
);

userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
);
userSchema.index(
  { facebookId: 1 },
  { unique: true, partialFilterExpression: { facebookId: { $type: 'string' } } },
);
userSchema.index(
  { openidId: 1 },
  { unique: true, partialFilterExpression: { openidId: { $type: 'string' } } },
);
userSchema.index(
  { githubId: 1 },
  { unique: true, partialFilterExpression: { githubId: { $type: 'string' } } },
);
userSchema.index(
  { discordId: 1 },
  { unique: true, partialFilterExpression: { discordId: { $type: 'string' } } },
);

module.exports = userSchema;
