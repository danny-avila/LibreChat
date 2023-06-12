const passport = require('passport');
const jwt = require('jsonwebtoken');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const config = require('../../config/loader');
const domains = config.domains;

const User = require('../models/User');

Issuer.discover(process.env.OPENID_ISSUER)
  .then((issuer) => {
    const client = new issuer.Client({
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [domains.server + process.env.OPENID_CALLBACK_URL],
    });

    const openidOptions = {
      client,
      params: {
        scope: process.env.OPENID_SCOPE,
      },
      passReqToCallback: true,
    };

    const openidLogin = new OpenIDStrategy(openidOptions, async (req, tokenset, userinfo, done) => {
      try {
        let user = await User.findOne({ email: userinfo.email });
        if (!user) {
          user = new User({
            provider: 'openid',
            openidId: userinfo.sub,
            username: userinfo.given_name,
            email: userinfo.email,
            emailVerified: userinfo.email_verified,
            name: userinfo.given_name + ' ' + userinfo.family_name,
            avatar: '',
          });
        } else {
          user.provider = 'openid';
          user.openidId = userinfo.sub;
          user.username = userinfo.given_name;
          user.name = userinfo.given_name + ' ' + userinfo.family_name;
          user.avatar = '';
        }

        await user.save();

        const payload = { id: user.id };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        done(null, token);
      } catch (err) {
        done(err);
      }
    });

    passport.use('openid', openidLogin);
  })
  .catch((err) => {
    console.error(err);
  });
