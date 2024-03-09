const express = require('express');
const { isEnabled } = require('~/server/utils');
const { logger } = require('~/config');

const router = express.Router();

router.get('/', async function (req, res) {
  const isBirthday = () => {
    const today = new Date();
    return today.getMonth() === 1 && today.getDate() === 11;
  };

  try {
    const payload = {
      appTitle: process.env.APP_TITLE || 'LibreChat',
      clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      serverDomain: process.env.DOMAIN_SERVER || 'http://localhost:3080',
      registrationEnabled: isEnabled(process.env.ALLOW_REGISTRATION),
      checkBalance: isEnabled(process.env.CHECK_BALANCE),
      showBirthdayIcon:
        isBirthday() ||
        isEnabled(process.env.SHOW_BIRTHDAY_ICON) ||
        process.env.SHOW_BIRTHDAY_ICON === '',
      helpAndFaqURL: process.env.HELP_AND_FAQ_URL || 'https://librechat.ai',
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
