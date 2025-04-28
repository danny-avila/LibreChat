const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

const ApiKey = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKey; 