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
    active: {
      type: Boolean,
      default: true,
    },
    subscription: {
      active: {
        type: Boolean,
        default: false,
      },
      customerId: {
        type: String,
        default: '',
      },
      subscriptionId: {
        type: String,
        default: '',
      },
      subType: {
        type: String,
        enum: ['MONTHLY', 'YEARLY'],
        default: 'MONTHLY',
      },
      renewalDate: {
        type: Date,
      },
    },
    credits: {
      type: Number,
      default: 2000,
    },
  },
  { timestamps: true },
);

module.exports = userSchema;
