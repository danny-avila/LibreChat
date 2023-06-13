const passport = require('passport');
const jwt = require('jsonwebtoken');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../../config/loader');
const domains = config.domains;

const User = require('../models/User');

let crypto;
try {
  crypto = require('node:crypto');
} catch (err) {
  console.error('crypto support is disabled!');
}

const downloadImage = async (url, imagePath, accessToken) => {
  const response = await axios.get(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    responseType: 'arraybuffer'
  });

  // Ensure the directory exists, if not, create it
  fs.mkdirSync(path.dirname(imagePath), { recursive: true });

  fs.writeFileSync(imagePath, response.data);
}

Issuer.discover(process.env.OPENID_ISSUER)
  .then(issuer => {
    const client = new issuer.Client({
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [domains.server + process.env.OPENID_CALLBACK_URL]
    });

    const openidLogin = new OpenIDStrategy(
      {
        client,
        params: {
          scope: process.env.OPENID_SCOPE
        }
      },
      async (tokenset, userinfo, done) => {
        try {
          let user = await User.findOne({ email: userinfo.email });
          if (!user) {
            user = new User({
              provider: 'openid',
              openidId: userinfo.sub,
              username: userinfo.given_name || '',
              email: userinfo.email || '',
              emailVerified: userinfo.email_verified || false,
              name: (userinfo.given_name || '') + ' ' + (userinfo.family_name || '')
             });
          } else {
            user.provider = 'openid';
            user.openidId = userinfo.sub;
            user.username = userinfo.given_name || '';
            user.name = (userinfo.given_name || '') + ' ' + (userinfo.family_name || '');
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

            const imagePath = path.join(__dirname, '..', '..', 'client', 'public', 'images', 'openid', fileName);

            // Download image
            await downloadImage(imageUrl, imagePath, tokenset.access_token);

            user.avatar = '/images/openid/' + fileName; 
          } else {
            user.avatar = '';
          }

          await user.save();

          const payload = {
            id: user._id,
            username: user.username,
            email: user.email
            // Add other user data if needed
          };
          
          const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '1h' // Adjust the expiration as needed
          });

          done(null, user, token);
        } catch (err) {
          done(err);
        }
      }
    );

    passport.use('openid', openidLogin);

  })
  .catch(err => {
    console.error(err);
  });
