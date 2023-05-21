const mongoose = require('mongoose');

const pluginAuthSchema = mongoose.Schema(
  {
    authField: {
      type: String,
      required: true,
    },
    value: {
      type: String,
      required: true
    },
    userId: {
      type: String,
      required: true
    },
    pluginKey: {
      type: String,
    }
  },
  { timestamps: true }
);

const PluginAuth = mongoose.models.Plugin || mongoose.model('PluginAuth', pluginAuthSchema);

module.exports = PluginAuth;