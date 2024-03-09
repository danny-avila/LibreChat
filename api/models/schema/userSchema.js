const mongoose = require('mongoose');

const userSchema = mongoose.Schema(
  {
    clerkUserId: {
      type: String,
      required: [true, 'can\'t be blank'],
      unique: true,
      index: true,
    },
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
    avatar: {
      type: String,
      required: false,
    },
    role: {
      type: String,
      default: 'USER',
    },
    plugins: {
      type: Array,
      default: [],
    },
  },
  { timestamps: true },
);

module.exports = userSchema;
