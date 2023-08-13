const AppConfig = require('../../models/schema/appConfigSchema');

const buildInitialAppConfigFromEnv = () => {
  return {
    appTitle: process.env.APP_TITLE,
    socialLoginEnabled: process.env.ALLOW_SOCIAL_LOGIN === 'true' || false,
    googleLoginEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    openidLoginEnabled: !!process.env.OPENID_CLIENT_ID && !!process.env.OPENID_CLIENT_SECRET,
    githubLoginEnabled: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
    discordLoginEnabled: !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET,
    searchEnabled: process.env.ALLOW_SEARCH === 'true' || false,
    meiliHost: process.env.MEILI_HOST || 'http://0.0.0.0:7700',
    meiliAddress: process.env.MEILI_ADDRESS || '0.0.0.0:7700',
    meiliKey: process.env.MEILI_KEY || 'DrhYf7zENyR6AlUCKmnz0eYASOQdl6zxH7s7MKFSfFCt',
    disableMeiliAnalytics: process.env.MEILI_NO_ANALYTICS === 'true' || false,
    emailEnabled:
      !!process.env.EMAIL_SERVICE && !!process.env.EMAIL_USERNAME && !!process.env.EMAIL_PASSWORD,
    emailService: process.env.EMAIL_SERVICE || '',
    emailUsername: process.env.EMAIL_USERNAME || '',
    emailPassword: process.env.EMAIL_PASSWORD || '',
    emailFromName: process.env.EMAIL_FROM || '',
    emailFromAddress: process.env.EMAIL_FROM || '',
    emailPort: process.env.EMAIL_PORT || '587',
    registrationEnabled: process.env.ALLOW_REGISTRATION === 'true' || false,
    openidIssuer: process.env.OPENID_ISSUER || '',
    openidSessionSecret: process.env.OPENID_SESSION_SECRET || '',
    openidScope: process.env.OPENID_SCOPE || '',
    openidButtonIcon: process.env.OPENID_IMAGE_URL || '',
    openidButtonLabel: process.env.OPENID_BUTTON_LABEL || 'Login with OpenID',
    openidClientId: process.env.OPENID_CLIENT_ID || '',
    openidClientSecret: process.env.OPENID_CLIENT_SECRET || '',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    discordClientId: process.env.DISCORD_CLIENT_ID || '',
    discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  };
};

const buildAppConfigFromResult = (result) => {
  const appConfig = {
    appTitle: result.appTitle,
    auth: {
      registrationEnabled: result.registrationEnabled,
      socialLoginEnabled: result.socialLoginEnabled,
      googleLoginEnabled: result.googleLoginEnabled,
      githubLoginEnabled: result.githubLoginEnabled,
      discordLoginEnabled: result.discordLoginEnabled,
      openidLoginEnabled: result.openidLoginEnabled,
      google: {
        clientId: result.googleClientId,
        clientSecret: result.googleClientSecret,
      },
      github: {
        clientId: result.githubClientId,
        clientSecret: result.githubClientSecret,
      },
      discord: {
        clientId: result.discordClientId,
        clientSecret: result.discordClientSecret,
      },
      openid: {
        clientId: result.openidClientId,
        clientSecret: result.openidClientSecret,
        issuer: result.openidIssuer,
        sessionSecret: result.openidSessionSecret,
        scope: result.openidScope,
        buttonLabel: result.openidButtonLabel,
        buttonIcon: result.openidButtonIcon,
      },
    },
    search: {
      searchEnabled: result.searchEnabled,
      meiliHost: result.meiliHost,
      meiliAddress: result.meiliAddress,
      meiliKey: result.meiliKey,
      disableMeiliAnalytics: result.disableMeiliAnalytics,
    },
    email: {
      emailEnabled: result.emailEnabled,
      emailService: result.emailService,
      emailPort: result.emailPort,
      emailUsername: result.emailUsername,
      emailPassword: result.emailPassword,
      emailFromAddress: result.emailFromAddress,
      emailFromName: result.emailFromName,
    },
  };
  return appConfig;
};

const getAppConfigController = async (req, res) => {
  try {
    let config = await AppConfig.findOne();
    if (!config) {
      config = buildInitialAppConfigFromEnv();
      await AppConfig.create(config);
    }
    const appConfig = buildAppConfigFromResult(config);
    return res.status(200).send(appConfig);
  } catch (err) {
    console.error(err);
    return res.status(500).send({ error: err.message });
  }
};

const updateAppConfigController = async (req, res) => {
  try {
    const configResult = await AppConfig.findOneAndUpdate(
      {},
      { ...req.body },
      { new: true },
    ).lean();
    const appConfig = buildAppConfigFromResult(configResult);
    return res.status(200).send(appConfig);
  } catch (err) {
    console.error(err);
    return res.status(500).send({ error: err.message });
  }
};

module.exports = {
  getAppConfigController,
  updateAppConfigController,
};
