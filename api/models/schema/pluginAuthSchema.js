const { logger } = require('~/config');
const mongoose = require('mongoose');

const pluginAuthSchema = mongoose.Schema(
  {
    authField: {
      type: String,
      required: true,
    },
    value: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    pluginKey: {
      type: String,
    },
  },
  { timestamps: true },
);

const PluginAuth = mongoose.models.Plugin || mongoose.model('PluginAuth', pluginAuthSchema);

PluginAuth.on('index', (error) => {
  if (error) {
    logger.error(`Failed to create PluginAuth index ${error}`);
  }
});

module.exports = PluginAuth;
