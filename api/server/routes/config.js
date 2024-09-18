const express = require('express');
const { CacheKeys, defaultSocialLogins, Constants } = require('librechat-data-provider');
const { getLdapConfig } = require('~/server/services/Config/ldap');
const { getProjectByName } = require('~/models/Project');
const { isEnabled } = require('~/server/utils');
const { getLogStores } = require('~/cache');
const { logger } = require('~/config');
const jwtDecode = require('jsonwebtoken/decode');

const router = express.Router();
const emailLoginEnabled =
  process.env.ALLOW_EMAIL_LOGIN === undefined || isEnabled(process.env.ALLOW_EMAIL_LOGIN);
const passwordResetEnabled = isEnabled(process.env.ALLOW_PASSWORD_RESET);

const sharedLinksEnabled =
  process.env.ALLOW_SHARED_LINKS === undefined || isEnabled(process.env.ALLOW_SHARED_LINKS);

const publicSharedLinksEnabled =
  sharedLinksEnabled &&
  (process.env.ALLOW_SHARED_LINKS_PUBLIC === undefined ||
    isEnabled(process.env.ALLOW_SHARED_LINKS_PUBLIC));

async function verifyAssistantConfigurations(headers, cachedValue) {
  let jwt = '';
  let found = false;
  for (let header of headers) {
    if (header.includes('Bearer')) {
      jwt = header.replace('Bearer ', '');
      found = true;
      break;
    }
  }

  if (global.AssistantCreationPermissions) {
    if (global.AssistantCreationPermissions.length === 0) {
      return false;
    }
  } else {
    return true;
  }

  if (found && jwt !== 'undefined' && jwt !== '' && jwt !== 'null') {
    let userToken = jwtDecode(jwt);
    const userGroups = global.myCache.get(userToken.id);
    if (userGroups) {
      for (let group of userGroups) {
        if (global.AssistantCreationPermissions.includes(group)) {
          return true;
        }
      }
    }
  }

  // en caso de que no exista jwt, verificamos si existe en cache
  if (cachedValue && (jwt === 'undefined' || jwt === '' || jwt === 'null')) {
    return cachedValue.userAssistantConfigPermission;
  }

  // por defecto no tiene permisos
  return false;
}
router.get('/', async function (req, res) {
  const cache = getLogStores(CacheKeys.CONFIG_STORE);
  const cachedStartupConfig = await cache.get(CacheKeys.STARTUP_CONFIG);
  // if (cachedStartupConfig && !haveToUpdateData) {
  //   res.send(cachedStartupConfig);
  //   return;
  // }

  const isBirthday = () => {
    const today = new Date();
    return today.getMonth() === 1 && today.getDate() === 11;
  };

  const instanceProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, '_id');

  const ldap = getLdapConfig();

  try {
    /** @type {TStartupConfig} */
    const payload = {
      appTitle: process.env.APP_TITLE || 'Intelewriter',
      socialLogins: req.app.locals.socialLogins ?? defaultSocialLogins,
      discordLoginEnabled: !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET,
      facebookLoginEnabled:
        !!process.env.FACEBOOK_CLIENT_ID && !!process.env.FACEBOOK_CLIENT_SECRET,
      githubLoginEnabled: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
      googleLoginEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      openidLoginEnabled:
        !!process.env.OPENID_CLIENT_ID &&
        !!process.env.OPENID_CLIENT_SECRET &&
        !!process.env.OPENID_ISSUER &&
        !!process.env.OPENID_SESSION_SECRET,
      openidLabel: process.env.OPENID_BUTTON_LABEL || 'Continue with OpenID',
      openidImageUrl: process.env.OPENID_IMAGE_URL,
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
      checkBalance: isEnabled(process.env.CHECK_BALANCE),
      showBirthdayIcon:
        isBirthday() ||
        isEnabled(process.env.SHOW_BIRTHDAY_ICON) ||
        process.env.SHOW_BIRTHDAY_ICON === '',
      helpAndFaqURL: process.env.HELP_AND_FAQ_URL || 'https://librechat.ai',
      interface: req.app.locals.interfaceConfig,
      modelSpecs: req.app.locals.modelSpecs,
      sharedLinksEnabled,
      publicSharedLinksEnabled,
      analyticsGtmId: process.env.ANALYTICS_GTM_ID,
      instanceProjectId: instanceProject._id.toString(),
    };

    if (ldap) {
      payload.ldap = ldap;
    }

    if (typeof process.env.CUSTOM_FOOTER === 'string') {
      payload.customFooter = process.env.CUSTOM_FOOTER;
    }

    payload.userAssistantConfigPermission = await verifyAssistantConfigurations(
      req.rawHeaders,
      cachedStartupConfig,
    );

    await cache.set(CacheKeys.STARTUP_CONFIG, payload);
    return res.status(200).send(payload);
  } catch (err) {
    logger.error('Error in startup config', err);
    return res.status(500).send({ error: err.message });
  }
});

module.exports = router;
