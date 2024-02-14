const mongoose = require('mongoose');

const assistantSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assistant_id: {
      type: String,
      unique: true,
      index: true,
      required: true,
    },
    avatar: {
      type: {
        filepath: String,
        source: String,
      },
      default: undefined,
    },
    access_level: {
      type: Number,
    },
    file_ids: { type: [String], default: undefined },
    actions: { type: [String], default: undefined },
  },
  {
    timestamps: true,
  },
);

module.exports = assistantSchema;
