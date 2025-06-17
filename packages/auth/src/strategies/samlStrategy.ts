import fs from 'fs';
import path from 'path';
import { hashToken, logger } from '@librechat/data-schemas';

import { Strategy as SamlStrategy, Profile, PassportSamlConfig } from '@node-saml/passport-saml';
import { getBalanceConfig, getMethods, getSaveBufferStrategy } from '../initAuth';

let crypto: typeof import('node:crypto') | undefined;

/**
 * Retrieves the certificate content from the given value.
 *
 * This function determines whether the provided value is a certificate string (RFC7468 format or
 * base64-encoded without a header) or a valid file path. If the value matches one of these formats,
 * the certificate content is returned. Otherwise, an error is thrown.
 *
 * @see https://github.com/node-saml/node-saml/tree/master?tab=readme-ov-file#configuration-option-idpcert
 * @param {string} value - The certificate string or file path.
 * @returns {string} The certificate content if valid.
 * @throws {Error} If the value is not a valid certificate string or file path.
 */
function getCertificateContent(value: any): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid input: SAML_CERT must be a string.');
  }

  // Check if it's an RFC7468 formatted PEM certificate
  const pemRegex = new RegExp(
    '-----BEGIN (CERTIFICATE|PUBLIC KEY)-----\n' + // header
      '([A-Za-z0-9+/=]{64}\n)+' + // base64 content (64 characters per line)
      '[A-Za-z0-9+/=]{1,64}\n' + //  base64 content (last line)
      '-----END (CERTIFICATE|PUBLIC KEY)-----', // footer
  );
  if (pemRegex.test(value)) {
    logger.info('[samlStrategy] Detected RFC7468-formatted certificate string.');
    return value;
  }

  // Check if it's a Base64-encoded certificate (no header)
  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length % 4 === 0) {
    logger.info('[samlStrategy] Detected base64-encoded certificate string (no header).');
    return value;
  }

  // Check if file exists and is readable
  // const root = path.resolve(__dirname, '..', '..');
  const certPath = path.normalize(path.isAbsolute(value) ? value : '/');
  // const certPath = path.normalize(path.isAbsolute(value) ? value : path.join(root, value));
  if (fs.existsSync(certPath) && fs.statSync(certPath).isFile()) {
    try {
      logger.info(`[samlStrategy] Loading certificate from file: ${certPath}`);
      return fs.readFileSync(certPath, 'utf8').trim();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error reading certificate file: ${errorMessage}`);
    }
  }

  throw new Error('Invalid cert: SAML_CERT must be a valid file path or certificate string.');
}

/**
 * Retrieves a SAML claim from a profile object based on environment configuration.
 * @param {object} profile - Saml profile
 * @param {string} envVar - Environment variable name (SAML_*)
 * @param {string} defaultKey -  Default key to use if the environment variable is not set
 * @returns {string}
 */
function getSamlClaim(profile: Profile | null, envVar: string, defaultKey: string): string {
  if (profile) {
    const claimKey = process.env[envVar] as keyof Profile;
    let returnVal = profile[defaultKey as keyof Profile];
    // Avoids accessing `profile[""]` when the environment variable is empty string.
    if (claimKey) {
      returnVal = profile[claimKey] ?? profile[defaultKey as keyof Profile];
    }
    if (typeof returnVal == 'string') {
      return returnVal;
    }
  }

  return '';
}

function getEmail(profile: Profile | null) {
  return getSamlClaim(profile, 'SAML_EMAIL_CLAIM', 'email');
}

function getUserName(profile: Profile | null): string {
  return getSamlClaim(profile, 'SAML_USERNAME_CLAIM', 'username');
}

function getGivenName(profile: Profile | null) {
  return getSamlClaim(profile, 'SAML_GIVEN_NAME_CLAIM', 'given_name');
}

function getFamilyName(profile: Profile | null) {
  return getSamlClaim(profile, 'SAML_FAMILY_NAME_CLAIM', 'family_name');
}

function getPicture(profile: Profile | null) {
  return getSamlClaim(profile, 'SAML_PICTURE_CLAIM', 'picture');
}

/**
 * Downloads an image from a URL using an access token.
 * @param {string} url
 * @returns {Promise<Buffer>}
 */
const downloadImage = async (url: string) => {
  try {
    const response = await fetch(url);
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else {
      throw new Error(`${response.statusText} (HTTP ${response.status})`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[samlStrategy] Error downloading image at URL "${url}": ${errorMessage}`);
    return null;
  }
};

/**
 * Determines the full name of a user based on SAML profile and environment configuration.
 *
 * @param {Object} profile - The user profile object from SAML Connect
 * @returns {string} The determined full name of the user
 */
function getFullName(profile: Profile | null): string {
  const nameClaim = process.env.SAML_NAME_CLAIM;
  if (profile && nameClaim && nameClaim in profile) {
    const key = nameClaim as keyof Profile;
    logger.info(
      `[samlStrategy] Using SAML_NAME_CLAIM: ${process.env.SAML_NAME_CLAIM}, profile: ${profile[key]}`,
    );
    return profile[key] + '';
  }

  const givenName = getGivenName(profile);
  const familyName = getFamilyName(profile);

  if (givenName && familyName) {
    return `${givenName} ${familyName}`;
  }

  if (givenName) {
    return givenName + '';
  }
  if (familyName) {
    return familyName + '';
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
function convertToUsername(input: string | string[], defaultValue: string = '') {
  if (typeof input === 'string') {
    return input;
  } else if (Array.isArray(input)) {
    return input.join('_');
  }

  return defaultValue;
}
const signOnVerify = async (profile: Profile | null, done: (err: any, user?: any) => void) => {
  const { findUser, createUser, updateUser } = getMethods();
  try {
    logger.info(`[samlStrategy] SAML authentication received for NameID: ${profile?.nameID}`);
    logger.debug('[samlStrategy] SAML profile:', profile);

    let user = await findUser({ samlId: profile?.nameID });
    logger.info(
      `[samlStrategy] User ${user ? 'found' : 'not found'} with SAML ID: ${profile?.nameID}`,
    );

    if (!user) {
      const email = getEmail(profile) || '';
      user = await findUser({ email });
      logger.info(
        `[samlStrategy] User ${user ? 'found' : 'not found'} with email: ${profile?.email}`,
      );
    }

    const fullName = getFullName(profile);

    const username = convertToUsername(
      getUserName(profile) || getGivenName(profile) || getEmail(profile),
    );

    if (!user) {
      user = {
        provider: 'saml',
        samlId: profile?.nameID,
        username,
        email: getEmail(profile) || '',
        emailVerified: true,
        name: fullName,
      };
      const balanceConfig = await getBalanceConfig();
      user = await createUser(user, balanceConfig, true, true);
    } else {
      user.provider = 'saml';
      user.samlId = profile?.nameID;
      user.username = username;
      user.name = fullName;
    }

    const picture = getPicture(profile);
    if (picture && !user.avatar?.includes('manual=true')) {
      const imageBuffer = await downloadImage(profile?.picture?.toString() ?? '');
      if (imageBuffer) {
        let fileName;

        try {
          crypto = await import('node:crypto');
        } catch (err) {
          logger.error('[samlStrategy] crypto support is disabled!', err);
        }

        if (crypto) {
          fileName = (await hashToken(profile?.nameID.toString() ?? '')) + '.png';
        } else {
          fileName = profile?.nameID + '.png';
        }

        const saveBuffer = getSaveBufferStrategy();
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
};

const samlLogin = () => {
  const samlConfig: PassportSamlConfig = {
    entryPoint: process.env.SAML_ENTRY_POINT,
    issuer: process.env.SAML_ISSUER + '',
    callbackUrl: process.env.SAML_CALLBACK_URL + '',
    idpCert: getCertificateContent(process.env.SAML_CERT) ?? '',
    wantAssertionsSigned: process.env.SAML_USE_AUTHN_RESPONSE_SIGNED === 'true' ? false : true,
    wantAuthnResponseSigned: process.env.SAML_USE_AUTHN_RESPONSE_SIGNED === 'true' ? true : false,
  };
  return new SamlStrategy(samlConfig, signOnVerify, () => {
    logger.info('saml logout!');
  });
};

export { samlLogin, getCertificateContent };
