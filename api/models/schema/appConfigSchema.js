const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema({
  socialLoginEnabled: { type: Boolean, default: false },
  googleLoginEnabled: { type: Boolean, default: false },
  openidLoginEnabled: { type: Boolean, default: false },
  githubLoginEnabled: { type: Boolean, default: false },
  discordLoginEnabled: { type: Boolean, default: false },
  appTitle: { type: String, default: 'LibreChat' },
  searchEnabled: { type: Boolean, default: true },
  meiliHost: { type: String, default: 'http://0.0.0.0:7700' },
  meiliAddress: { type: String, default: '0.0.0.0:7700' },
  meiliKey: { type: String, default: 'DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt' },
  disableMeiliAnalytics: { type: Boolean, default: true },
  emailEnabled: { type: Boolean, default: false },
  emailService: { type: String, default: '' },
  emailUsername: { type: String, default: '' },
  emailPassword: { type: String, default: '' },
  emailFromName: { type: String, default: '' },
  emailFromAddress: { type: String, default: '' },
  emailPort: { type: String, default: '587' },
  registrationEnabled: { type: Boolean, default: true },
  openidIssuer: { type: String, default: '' },
  openidSessionSecret: { type: String, default: '' },
  openidScope: { type: String, default: '' },
  openidButtonLabel: { type: String, default: '' },
  openidButtonIcon: { type: String, default: '' },
  openidClientId: { type: String, default: '' },
  openidClientSecret: { type: String, default: '' },
  googleClientId: { type: String, default: '' },
  googleClientSecret: { type: String, default: '' },
  githubClientId: { type: String, default: '' },
  githubClientSecret: { type: String, default: '' },
  discordClientId: { type: String, default: '' },
  discordClientSecret: { type: String, default: '' },
});

const AppConfig = mongoose.models.AppConfig || mongoose.model('AppConfig', appConfigSchema);

module.exports = AppConfig;
