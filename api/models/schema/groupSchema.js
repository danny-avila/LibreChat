const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    description: {
      type: String,
    },
    allowedEndpoints: [
      {
        type: String,
        required: true,

      },
    ],
    allowedModels: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true },
);

module.exports = groupSchema;