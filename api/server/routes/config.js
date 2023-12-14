const express = require('express');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();
const emailLoginEnabled =
  process.env.ALLOW_EMAIL_LOGIN === undefined || isEnabled(process.env.ALLOW_EMAIL_LOGIN);

router.get('/', async function (req, res) {
  try {
    const payload = {
      appTitle: process.env.APP_TITLE || 'LibreChat',
      googleLoginEnabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      facebookLoginEnabled:
        !!process.env.FACEBOOK_CLIENT_ID && !!process.env.FACEBOOK_CLIENT_SECRET,
      openidLoginEnabled:
        !!process.env.OPENID_CLIENT_ID &&
        !!process.env.OPENID_CLIENT_SECRET &&
        !!process.env.OPENID_ISSUER &&
        !!process.env.OPENID_SESSION_SECRET,
      openidLabel: process.env.OPENID_BUTTON_LABEL || 'Login with OpenID',
      openidImageUrl: process.env.OPENID_IMAGE_URL,
      githubLoginEnabled: !!process.env.GITHUB_CLIENT_ID && !!process.env.GITHUB_CLIENT_SECRET,
      discordLoginEnabled: !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET,
      serverDomain: process.env.DOMAIN_SERVER || 'http://localhost:3080',
      emailLoginEnabled,
      registrationEnabled: isEnabled(process.env.ALLOW_REGISTRATION),
      socialLoginEnabled: isEnabled(process.env.ALLOW_SOCIAL_LOGIN),
      emailEnabled:
        (!!process.env.EMAIL_SERVICE || !!process.env.EMAIL_HOST) &&
        !!process.env.EMAIL_USERNAME &&
        !!process.env.EMAIL_PASSWORD &&
        !!process.env.EMAIL_FROM,
      checkBalance: isEnabled(process.env.CHECK_BALANCE),
    };

    if (typeof process.env.CUSTOM_FOOTER === 'string') {
      payload.customFooter = process.env.CUSTOM_FOOTER;
    }

    return res.status(200).send(payload);
  } catch (err) {
    logger.error('Error in startup config', err);
    return res.status(500).send({ error: err.message });
  }
});

module.exports = router;
