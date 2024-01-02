const fs = require('fs');
const path = require('path');
const axios = require('axios');
const passport = require('passport');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const { logger } = require('~/config');
const User = require('~/models/User');

let crypto;
try {
  crypto = require('node:crypto');
} catch (err) {
  logger.error('[openidStrategy] crypto support is disabled!', err);
}

const downloadImage = async (url, imagePath, accessToken) => {
  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      responseType: 'arraybuffer',
    });

    fs.mkdirSync(path.dirname(imagePath), { recursive: true });
    fs.writeFileSync(imagePath, response.data);

    const fileName = path.basename(imagePath);

    return `/images/openid/${fileName}`;
  } catch (error) {
    logger.error(
      `[openidStrategy] downloadImage: Error downloading image at URL "${url}": ${error}`,
    );
    return '';
  }
};

async function setupOpenId() {
  try {
    const issuer = await Issuer.discover(process.env.OPENID_ISSUER);
    const client = new issuer.Client({
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL],
    });

    const openidLogin = new OpenIDStrategy(
      {
        client,
        params: {
          scope: process.env.OPENID_SCOPE,
        },
      },
      async (tokenset, userinfo, done) => {
        try {
          let user = await User.findOne({ openidId: userinfo.sub });

          if (!user) {
            user = await User.findOne({ email: userinfo.email });
          }

          let fullName = '';
          if (userinfo.given_name && userinfo.family_name) {
            fullName = userinfo.given_name + ' ' + userinfo.family_name;
          } else if (userinfo.given_name) {
            fullName = userinfo.given_name;
          } else if (userinfo.family_name) {
            fullName = userinfo.family_name;
          } else {
            fullName = userinfo.username || userinfo.email;
          }

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
            user.provider = 'openid';
            user.openidId = userinfo.sub;
            user.username = userinfo.username || userinfo.given_name || '';
            user.name = fullName;
          }

          if (userinfo.picture) {
            const imageUrl = userinfo.picture;

            let fileName;
            if (crypto) {
              const hash = crypto.createHash('sha256');
              hash.update(userinfo.sub);
              fileName = hash.digest('hex') + '.png';
            } else {
              fileName = userinfo.sub + '.png';
            }

            const imagePath = path.join(
              __dirname,
              '..',
              '..',
              'client',
              'public',
              'images',
              'openid',
              fileName,
            );

            const imagePathOrEmpty = await downloadImage(
              imageUrl,
              imagePath,
              tokenset.access_token,
            );

            user.avatar = imagePathOrEmpty;
          } else {
            user.avatar = '';
          }

          await user.save();

          done(null, user);
        } catch (err) {
          done(err);
        }
      },
    );

    passport.use('openid', openidLogin);
  } catch (err) {
    logger.error('[openidStrategy]', err);
  }
}

module.exports = setupOpenId;
