const passport = require('passport');
const jwtDecode = require('jsonwebtoken/decode');
const { Issuer, Strategy: OpenIDStrategy } = require('openid-client');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { logger } = require('~/config');
const User = require('~/models/User');

let crypto;
try {
  crypto = require('node:crypto');
} catch (err) {
  logger.error('[openidStrategy] crypto support is disabled!', err);
}
/**
 * Downloads an image from a URL using an access token.
 * @param {string} url
 * @param {string} accessToken
 * @returns {Promise<Buffer>}
 */
const downloadImage = async (url, accessToken) => {
  if (!url) {
    return '';
  }

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      const buffer = await response.buffer();
      return buffer;
    } else {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
  } catch (error) {
    logger.error(
      `[openidStrategy] downloadImage: Error downloading image at URL "${url}": ${error}`,
    );
    return '';
  }
};

/**
 * Converts an input into a string suitable for a username.
 * If the input is a string, it will be returned as is.
 * If the input is an array, elements will be joined with underscores.
 * In case of undefined or other falsy values, a default value will be returned.
 *
 * @param {string | string[] | undefined} input - The input value to be converted into a username.
 * @param {string} [defaultValue=''] - The default value to return if the input is falsy.
 * @returns {string} The processed input as a string suitable for a username.
 */
function convertToUsername(input, defaultValue = '') {
  if (typeof input === 'string') {
    return input;
  } else if (Array.isArray(input)) {
    return input.join('_');
  }

  return defaultValue;
}

async function setupOpenId() {
  try {
    const issuer = await Issuer.discover(process.env.OPENID_ISSUER);
    const client = new issuer.Client({
      client_id: process.env.OPENID_CLIENT_ID,
      client_secret: process.env.OPENID_CLIENT_SECRET,
      redirect_uris: [process.env.DOMAIN_SERVER + process.env.OPENID_CALLBACK_URL],
    });
    const requiredRole = process.env.OPENID_REQUIRED_ROLE;
    const requiredRoleParameterPath = process.env.OPENID_REQUIRED_ROLE_PARAMETER_PATH;
    const requiredRoleTokenKind = process.env.OPENID_REQUIRED_ROLE_TOKEN_KIND;
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

          if (requiredRole) {
            let decodedToken = '';
            if (requiredRoleTokenKind === 'access') {
              decodedToken = jwtDecode(tokenset.access_token);
            } else if (requiredRoleTokenKind === 'id') {
              decodedToken = jwtDecode(tokenset.id_token);
            }
            const pathParts = requiredRoleParameterPath.split('.');
            let found = true;
            let roles = pathParts.reduce((o, key) => {
              if (o === null || o === undefined || !(key in o)) {
                found = false;
                return [];
              }
              return o[key];
            }, decodedToken);

            if (!found) {
              console.error(
                `Key '${requiredRoleParameterPath}' not found in ${requiredRoleTokenKind} token!`,
              );
            }

            if (!roles.includes(requiredRole)) {
              return done(null, false, {
                message: `You must have the "${requiredRole}" role to log in.`,
              });
            }
          }

          const username = convertToUsername(
            userinfo.username || userinfo.given_name || userinfo.email,
          );

          if (!user) {
            user = new User({
              provider: 'openid',
              openidId: userinfo.sub,
              username,
              email: userinfo.email || '',
              emailVerified: userinfo.email_verified || false,
              name: fullName,
            });
          } else {
            user.provider = 'openid';
            user.openidId = userinfo.sub;
            user.username = username;
            user.name = fullName;
          }

          if (userinfo.picture) {
            /** @type {string | undefined} */
            const imageUrl = userinfo.picture;

            let fileName;
            if (crypto) {
              const hash = crypto.createHash('sha256');
              hash.update(userinfo.sub);
              fileName = hash.digest('hex') + '.png';
            } else {
              fileName = userinfo.sub + '.png';
            }

            const imageBuffer = await downloadImage(imageUrl, tokenset.access_token);
            const { saveBuffer } = getStrategyFunctions(process.env.CDN_PROVIDER);
            if (imageBuffer) {
              const imagePath = await saveBuffer({
                fileName,
                userId: user._id.toString(),
                buffer: imageBuffer,
              });
              user.avatar = imagePath ?? '';
            } else {
              user.avatar = '';
            }
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
