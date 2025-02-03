const axios = require('axios');
const { createSocialUser, handleExistingUser } = require('./process');
const { isEnabled } = require('~/server/utils');
const { findUser } = require('~/models');
const { logger } = require('~/config');

const socialLogin =
  (provider, getProfileDetails) => async (accessToken, refreshToken, idToken, profile, cb) => {
    try {
      const { email, id, avatarUrl, username, name, emailVerified } = getProfileDetails({
        idToken, profile,
      });

      ;
      const oldUser = await findUser({ email: email.trim() });
      const url = new URL(`${process.env.NEPP_HOST}/api/users/${encodeURIComponent(email.trim())}`);
      const options = {
        headers: {
          'X-API-Key': process.env.NEPP_API_KEY,
        },
        timeout: 5000,
      };
      // error handling, or not server will crash
      const neppUser = await axios.get(url.toString(), options);
      const orgination = neppUser.data.org_name;
      const ALLOW_SOCIAL_REGISTRATION = isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION);

      if (oldUser) {
        await handleExistingUser(oldUser, avatarUrl);
        return cb(null, oldUser);
      }

      if (ALLOW_SOCIAL_REGISTRATION) {
        const newUser = await createSocialUser({
          email,
          avatarUrl,
          provider,
          providerKey: `${provider}Id`,
          providerId: id,
          username,
          name,
          orgination,
          emailVerified,
        });
        return cb(null, newUser);
      }
    } catch (err) {
      logger.error(`[${provider}Login]`, err);
      return cb(err);
    }
  };

module.exports = socialLogin;
