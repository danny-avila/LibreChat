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
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    openidId: {
      type: String,
      unique: true,
      sparse: true,
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    discordId: {
      type: String,
      unique: true,
      sparse: true,
    },
    plugins: {
      type: Array,
      default: [],
    },
    refreshToken: {
      type: [Session],
    },
    refBy: {
      type: String,
      default: '',
    },
    referrals: {
      type: Array,
      default: [],
    },
    numOfReferrals: {
      type: Number,
      default: 0,
    },
    followers: {
      type: Object,
      default: {},
    },
    following: {
      type: Object,
      default: {},
    },
    biography: {
      type: String,
      default: '',
    },
    proMemberExpiredAt: {
      type: Date,
      default: new Date(),
    },
  },
  { timestamps: true },
);

module.exports = userSchema;
