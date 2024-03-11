const passport = require('passport');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const { logger } = require('~/config');
const User = require('~/models/User');
const { handleExistingUser } = require('./process');

const getFullName = (userinfo) => {
  const { given_name, family_name, username, email } = userinfo;

  if (given_name && family_name) {
    return `${given_name} ${family_name}`;
  }

  if (given_name) {
    return given_name;
  }

  if (family_name) {
    return family_name;
  }

  return username || email;
};

const setupOpenId = async () => {
  try {
    const issuer = await Issuer.discover(process.env.OPENID_ISSUER);
    const client = new issuer.Client({
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [`${process.env.DOMAIN_SERVER}${process.env.OPENID_CALLBACK_URL}`],
    });

    const strategy = new OpenIDStrategy(
      {
        client,
        params: { scope: process.env.OPENID_SCOPE },
      },
      async (tokenset, userinfo, done) => {
        try {
          let user =
            (await User.findOne({ openidId: userinfo.sub })) ||
            (await User.findOne({ email: userinfo.email }));
          const fullName = getFullName(userinfo);

          if (!user) {
            user = new User({
              provider: 'openid',
              openidId: userinfo.sub,
              username: userinfo.username || userinfo.given_name || '',
              email: userinfo.email || '',
              emailVerified: userinfo.email_verified || false,
              name: fullName,
            });
          } else {
            Object.assign(user, {
              provider: 'openid',
              openidId: userinfo.sub,
              username: userinfo.username || userinfo.given_name || '',
              name: fullName,
            });
            await handleExistingUser(user, userinfo.picture);
          }

          await user.save();
          done(null, user);
        } catch (err) {
          done(err);
        }
      },
    );

    passport.use('openid', strategy);
  } catch (err) {
    logger.error('[openidStrategy]', err);
  }
};

module.exports = setupOpenId;
