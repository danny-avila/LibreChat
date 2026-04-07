const express = require('express');
const { isEnabled, getBalanceConfig } = require('@librechat/api');
const { defaultSocialLogins } = require('librechat-data-provider');
const { logger, getTenantId } = require('@librechat/data-schemas');
const { getLdapConfig } = require('~/server/services/Config/ldap');
const { getAppConfig } = require('~/server/services/Config/app');

const router = express.Router();
const emailLoginEnabled =
  process.env.ALLOW_EMAIL_LOGIN === undefined || isEnabled(process.env.ALLOW_EMAIL_LOGIN);
const passwordResetEnabled = isEnabled(process.env.ALLOW_PASSWORD_RESET);

const sharedLinksEnabled =
  process.env.ALLOW_SHARED_LINKS === undefined || isEnabled(process.env.ALLOW_SHARED_LINKS);

const publicSharedLinksEnabled =
  sharedLinksEnabled && isEnabled(process.env.ALLOW_SHARED_LINKS_PUBLIC);

const sharePointFilePickerEnabled = isEnabled(process.env.ENABLE_SHAREPOINT_FILEPICKER);
const openidReuseTokens = isEnabled(process.env.OPENID_REUSE_TOKENS);

function isBirthday() {
  const today = new Date();
  return today.getMonth() === 1 && today.getDate() === 11;
}

function buildSharedPayload() {
  const isOpenIdEnabled =
    !!process.env.OPENID_CLIENT_ID &&
    !!process.env.OPENID_CLIENT_SECRET &&
    !!process.env.OPENID_ISSUER &&
    !!process.env.OPENID_SESSION_SECRET;

  const isSamlEnabled =
    !!process.env.SAML_ENTRY_POINT &&
    !!process.env.SAML_ISSUER &&
    !!process.env.SAML_CERT &&
    !!process.env.SAML_SESSION_SECRET;

  const ldap = getLdapConfig();

  /** @type {Partial<TStartupConfig>} */
  const payload = {
    appTitle: process.env.APP_TITLE || 'LibreChat',
    discordLoginEnabled: !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET,
    facebookLoginEnabled: !!process.env.FACEBOOK_CLIENT_ID && !!process.env.FACEBOOK_CLIENT_SECRET,
    githubLoginEnabled: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
    googleLoginEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    appleLoginEnabled:
      !!process.env.APPLE_CLIENT_ID &&
      !!process.env.APPLE_TEAM_ID &&
      !!process.env.APPLE_KEY_ID &&
      !!process.env.APPLE_PRIVATE_KEY_PATH,
    openidLoginEnabled: isOpenIdEnabled,
    openidLabel: process.env.OPENID_BUTTON_LABEL || 'Continue with OpenID',
    openidImageUrl: process.env.OPENID_IMAGE_URL,
    openidAutoRedirect: isEnabled(process.env.OPENID_AUTO_REDIRECT),
    samlLoginEnabled: !isOpenIdEnabled && isSamlEnabled,
    samlLabel: process.env.SAML_BUTTON_LABEL,
    samlImageUrl: process.env.SAML_IMAGE_URL,
    serverDomain: process.env.DOMAIN_SERVER || 'http://localhost:3080',
    emailLoginEnabled,
    registrationEnabled: !ldap?.enabled && isEnabled(process.env.ALLOW_REGISTRATION),
    socialLoginEnabled: isEnabled(process.env.ALLOW_SOCIAL_LOGIN),
    emailEnabled:
      (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
      !!process.env.EMAIL_USERNAME &&
      !!process.env.EMAIL_PASSWORD &&
      !!process.env.EMAIL_FROM,
    passwordResetEnabled,
    showBirthdayIcon:
      isBirthday() ||
      isEnabled(process.env.SHOW_BIRTHDAY_ICON) ||
      process.env.SHOW_BIRTHDAY_ICON === '',
    helpAndFaqURL: process.env.HELP_AND_FAQ_URL || 'https://librechat.ai',
    sharedLinksEnabled,
    publicSharedLinksEnabled,
    analyticsGtmId: process.env.ANALYTICS_GTM_ID,
    openidReuseTokens,
  };

  const minPasswordLength = parseInt(process.env.MIN_PASSWORD_LENGTH, 10);
  if (minPasswordLength && !isNaN(minPasswordLength)) {
    payload.minPasswordLength = minPasswordLength;
  }

  if (ldap) {
    payload.ldap = ldap;
  }

  if (typeof process.env.CUSTOM_FOOTER === 'string') {
    payload.customFooter = process.env.CUSTOM_FOOTER;
  }

  return payload;
}

function buildWebSearchConfig(appConfig) {
  const ws = appConfig?.webSearch;
  if (!ws) {
    return undefined;
  }
  const { searchProvider, scraperProvider, rerankerType } = ws;
  if (!searchProvider && !scraperProvider && !rerankerType) {
    return undefined;
  }
  return {
    ...(searchProvider && { searchProvider }),
    ...(scraperProvider && { scraperProvider }),
    ...(rerankerType && { rerankerType }),
  };
}

router.get('/', async function (req, res) {
  try {
    const sharedPayload = buildSharedPayload();

    if (!req.user) {
      const tenantId = getTenantId();
      const baseConfig = await getAppConfig(tenantId ? { tenantId } : { baseOnly: true });

      /** @type {Partial<TStartupConfig>} */
      const payload = {
        ...sharedPayload,
        socialLogins: baseConfig?.registration?.socialLogins ?? defaultSocialLogins,
        turnstile: baseConfig?.turnstileConfig,
      };

      const interfaceConfig = baseConfig?.interfaceConfig;
      if (interfaceConfig?.privacyPolicy || interfaceConfig?.termsOfService) {
        payload.interface = {};
        if (interfaceConfig.privacyPolicy) {
          payload.interface.privacyPolicy = interfaceConfig.privacyPolicy;
        }
        if (interfaceConfig.termsOfService) {
          payload.interface.termsOfService = interfaceConfig.termsOfService;
        }
      }

      return res.status(200).send(payload);
    }

    const appConfig = await getAppConfig({
      role: req.user.role,
      userId: req.user.id,
      tenantId: req.user.tenantId || getTenantId(),
    });

    const balanceConfig = getBalanceConfig(appConfig);

    /** @type {TStartupConfig} */
    const payload = {
      ...sharedPayload,
      socialLogins: appConfig?.registration?.socialLogins ?? defaultSocialLogins,
      interface: appConfig?.interfaceConfig,
      turnstile: appConfig?.turnstileConfig,
      modelSpecs: appConfig?.modelSpecs,
      balance: balanceConfig,
      bundlerURL: process.env.SANDPACK_BUNDLER_URL,
      staticBundlerURL: process.env.SANDPACK_STATIC_BUNDLER_URL,
      sharePointFilePickerEnabled,
      sharePointBaseUrl: process.env.SHAREPOINT_BASE_URL,
      sharePointPickerGraphScope: process.env.SHAREPOINT_PICKER_GRAPH_SCOPE,
      sharePointPickerSharePointScope: process.env.SHAREPOINT_PICKER_SHAREPOINT_SCOPE,
      conversationImportMaxFileSize: process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES
        ? parseInt(process.env.CONVERSATION_IMPORT_MAX_FILE_SIZE_BYTES, 10)
        : 0,
    };

    const webSearch = buildWebSearchConfig(appConfig);
    if (webSearch) {
      payload.webSearch = webSearch;
    }

    return res.status(200).send(payload);
  } catch (err) {
    logger.error('Error in startup config', err);
    return res.status(500).send({ error: err.message });
  }
});

module.exports = router;
