const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { parseString } = require('xml2js');
const passport = require('passport');
const { Strategy: SamlStrategy } = require('passport-saml');
const { MetadataReader } = require('passport-saml-metadata');
const { findUser, createUser, updateUser } = require('~/models/userMethods');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { hashToken } = require('~/server/utils/crypto');
const { logger } = require('~/config');

let crypto;
try {
  crypto = require('node:crypto');
} catch (err) {
  logger.error('[samlStrategy] crypto support is disabled!', err);
}

function isValidXml(content) {
  let isValid = false;
  parseString(content, (err, result) => {
    if (!err && result) {
      isValid = true;
    }
  });
  return isValid;
}

/**
 * Retrieves SAML metadata from an environment variable.
 *
 * This function checks the `SAML_METADATA` environment variable to determine
 * if it contains a file path or a one-liner metadata XML. If it is a file path,
 * the function reads and returns the file content. Otherwise, it returns the
 * value of the environment variable directly.
 *
 * @throws {Error} If the `SAML_METADATA` environment variable is not set.
 * @returns {string} The SAML metadata as a string.
 */
function getMetadata() {
  const metadataEnv = process.env.SAML_METADATA;

  if (!metadataEnv) {
    throw new Error('SAML_METADATA environment variable is not set.');
  }

  let metadataContent;
  const projectRoot = path.resolve(__dirname, '../../');
  const metadataPath = path.resolve(projectRoot, metadataEnv);

  if (fs.existsSync(metadataPath) && fs.statSync(metadataPath).isFile()) {
    logger.info(`[samlStrategy] Loading SAML metadata from file: ${metadataPath}`);
    metadataContent = fs.readFileSync(metadataPath, 'utf8');
  } else {
    logger.info('[samlStrategy] SAML metadata provided as an inline XML string.');
    metadataContent = metadataEnv;
  }

  if (!isValidXml(metadataContent)) {
    throw new Error(
      'Error: Invalid SAML metadata.\n' +
        'The content provided is not valid XML.\n' +
        'Ensure that SAML_METADATA contains either a valid XML file path or a correct XML string.',
    );
  }

  return metadataContent;
}

/**
 * Retrieves a SAML claim from a profile object based on environment configuration.
 * @param {object} profile - Saml profile
 * @param {string} envVar - Environment variable name (SAML_*)
 * @param {string} defaultKey -  Default key to use if the environment variable is not set
 * @returns {string}
 */
function getSamlClaim(profile, envVar, defaultKey) {
  const claimKey = process.env[envVar];

  // Avoids accessing `profile[""]` when the environment variable is empty string.
  if (claimKey) {
    return profile[claimKey] ?? profile[defaultKey];
  }
  return profile[defaultKey];
}

function getEmail(profile) {
  return getSamlClaim(profile, 'SAML_EMAIL_CLAIM', 'email');
}

function getUserName(profile) {
  return getSamlClaim(profile, 'SAML_USERNAME_CLAIM', 'username');
}

function getGivenName(profile) {
  return getSamlClaim(profile, 'SAML_GIVEN_NAME_CLAIM', 'given_name');
}

function getFamilyName(profile) {
  return getSamlClaim(profile, 'SAML_FAMILY_NAME_CLAIM', 'family_name');
}

function getPicture(profile) {
  return getSamlClaim(profile, 'SAML_PICTURE_CLAIM', 'picture');
}

/**
 * Downloads an image from a URL using an access token.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
const downloadImage = async (url) => {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.buffer();
    } else {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
  } catch (error) {
    logger.error(`[samlStrategy] Error downloading image at URL "${url}": ${error}`);
    return null;
  }
};

/**
 * Determines the full name of a user based on SAML profile and environment configuration.
 *
 * @param {Object} profile - The user profile object from SAML Connect
 * @returns {string} The determined full name of the user
 */
function getFullName(profile) {
  if (process.env.SAML_NAME_CLAIM) {
    logger.info(
      `[samlStrategy] Using SAML_NAME_CLAIM: ${process.env.SAML_NAME_CLAIM}, profile: ${profile[process.env.SAML_NAME_CLAIM]}`,
    );
    return profile[process.env.SAML_NAME_CLAIM];
  }

  const givenName = getGivenName(profile);
  const familyName = getFamilyName(profile);

  if (givenName && familyName) {
    return `${givenName} ${familyName}`;
  }

  if (givenName) {
    return givenName;
  }
  if (familyName) {
    return familyName;
  }

  return getUserName(profile) || getEmail(profile);
}

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

async function setupSaml() {
  try {
    const metadata = new MetadataReader(getMetadata());

    const samlConfig = {
      entryPoint: metadata.identityProviderUrl,
      issuer: metadata.entityId,
      path: process.env.SAML_CALLBACK_URL,
      cert: metadata.signingCert,
    };

    passport.use(
      'saml',
      new SamlStrategy(samlConfig, async (profile, done) => {
        try {
          logger.info(`[samlStrategy] SAML authentication received for NameID: ${profile.nameID}`);
          logger.debug('[samlStrategy] SAML profile:', profile);

          let user = await findUser({ samlId: profile.nameID });
          logger.info(
            `[samlStrategy] User ${user ? 'found' : 'not found'} with SAML ID: ${profile.nameID}`,
          );

          if (!user) {
            const email = getEmail(profile) || '';
            user = await findUser({ email });
            logger.info(
              `[samlStrategy] User ${user ? 'found' : 'not found'} with email: ${profile.email}`,
            );
          }

          const fullName = getFullName(profile);

          const username = convertToUsername(
            getUserName(profile) || getGivenName(profile) || getEmail(profile),
          );

          if (!user) {
            user = {
              provider: 'saml',
              samlId: profile.nameID,
              username,
              email: getEmail(profile) || '',
              emailVerified: true,
              name: fullName,
            };
            user = await createUser(user, true, true);
          } else {
            user.provider = 'saml';
            user.samlId = profile.nameID;
            user.username = username;
            user.name = fullName;
          }

          const picture = getPicture(profile);
          if (picture && !user.avatar?.includes('manual=true')) {
            const imageBuffer = await downloadImage(profile.picture);
            if (imageBuffer) {
              let fileName;
              if (crypto) {
                fileName = (await hashToken(profile.nameID)) + '.png';
              } else {
                fileName = profile.nameID + '.png';
              }

              const { saveBuffer } = getStrategyFunctions(process.env.CDN_PROVIDER);
              const imagePath = await saveBuffer({
                fileName,
                userId: user._id.toString(),
                buffer: imageBuffer,
              });
              user.avatar = imagePath ?? '';
            }
          }

          user = await updateUser(user._id, user);

          logger.info(
            `[samlStrategy] Login success SAML ID: ${user.samlId} | email: ${user.email} | username: ${user.username}`,
            {
              user: {
                samlId: user.samlId,
                username: user.username,
                email: user.email,
                name: user.name,
              },
            },
          );

          done(null, user);
        } catch (err) {
          logger.error('[samlStrategy] Login failed', err);
          done(err);
        }
      }),
    );
  } catch (err) {
    logger.error('[samlStrategy]', err);
  }
}

module.exports = setupSaml;
