const mongoose = require('mongoose');
const { pluginAuthSchema } = require('@librechat/data-schemas');

const PluginAuth = mongoose.models.Plugin || mongoose.model('PluginAuth', pluginAuthSchema);

module.exports = PluginAuth;
