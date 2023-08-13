export const SettingsDescriptions = {
  App: {
    title: 'App Title',
  },
  Auth: {
    registrationEnabled: 'registrationEnabled',
    socialLoginEnabled: 'socialLoginEnabled',
    googleLoginEnabled: 'googleLoginEnabled',
    githubLoginEnabled: 'githubLoginEnabled',
    discordLoginEnabled: 'discordLoginEnabled',
    openidLoginEnabled: 'isOpenIDEnabled',
    google: {
      clientId: 'googleClientId',
      clientSecret: 'googleClientSecret',
    },
    github: {
      clientId: 'githubClientId',
      clientSecret: 'githubClientSecret',
    },
    discord: {
      clientId: 'discordClientId',
      clientSecret: 'discordClientSecret',
    },
    openid: {
      clientId: 'openidClientId',
      clientSecret: 'openidClientSecret',
      issuer: 'openidIssuer',
      sessionSecret: 'openIdSessionSecret',
      scope: 'openIdScope',
      buttonLabel: 'openIdButtonLabel',
      buttonIcon: 'openIdButtonIcon',
    },
  },
  Search: {
    searchEnabled: 'isSearchEnabled',
    meiliHost: 'meiliHost',
    meiliAddress: 'meiliAddress',
    meiliKey: 'meiliKey',
    disableAnalytics: 'disableMeiliAnalytics',
  },
  Email: {
    emailEnabled: 'isEmailEnabled',
    emailService: 'emailService',
    emailPort: 'emailPort',
    emailUsername: 'emailUsername',
    emailPassword: 'emailPassword',
    emailFromAddress: 'emailFromAddress',
    emailFromName: 'emailFromName',
  },
};
