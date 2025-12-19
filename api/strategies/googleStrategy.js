const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { cloudidentity_v1, auth } = require('@googleapis/cloudidentity');
const socialLogin = require('./socialLogin');
const { logger } = require('~/config');

const CLOUD_IDENTITY_GROUPS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/cloud-identity.groups.readonly';
const BASE_GOOGLE_SCOPES = Object.freeze(['openid', 'profile', 'email']);

const GOOGLE_WORKSPACE_GROUP = process.env.GOOGLE_WORKSPACE_GROUP;
const GOOGLE_GROUP_RESTRICTION_ENABLED = Boolean(GOOGLE_WORKSPACE_GROUP);
const GOOGLE_SCOPES = Object.freeze(
  GOOGLE_GROUP_RESTRICTION_ENABLED
    ? [...BASE_GOOGLE_SCOPES, CLOUD_IDENTITY_GROUPS_READONLY_SCOPE]
    : [...BASE_GOOGLE_SCOPES],
);

const getProfileDetails = ({ profile }) => ({
  email: profile.emails[0].value,
  id: profile.id,
  avatarUrl: profile.photos[0].value,
  username: profile.name.givenName,
  name: `${profile.name.givenName}${profile.name.familyName ? ` ${profile.name.familyName}` : ''}`,
  emailVerified: profile.emails[0].verified,
});

/**
 * Creates a Cloud Identity client using OAuth access token
 * @param {string} accessToken - OAuth access token
 * @returns {cloudidentity_v1.Cloudidentity} Cloud Identity client
 */
function createCloudIdentityClient(accessToken) {
  const oauth2Client = new auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return new cloudidentity_v1.Cloudidentity({ auth: oauth2Client });
}

/**
 * Retrieves the resource name for a Google Workspace group
 * @param {cloudidentity_v1.Cloudidentity} client - Cloud Identity client
 * @param {string} groupEmail - Email address of the group
 * @returns {Promise<string|null>} Group resource name or null if not found
 */
async function getGroupResourceName(client, groupEmail) {
  try {
    const response = await client.groups.lookup({
      'groupKey.id': groupEmail,
    });
    return response?.data?.name ?? null;
  } catch (error) {
    logger.error(
      `[getGroupResourceName] Error looking up group: ${groupEmail}`,
      error.response?.data || error,
    );
    return null;
  }
}

/**
 * Creates a safe Cloud Identity membership query.
 * The Cloud Identity API uses a simple query language, so validate user input
 * to avoid query injection or malformed requests.
 * @param {string} userEmail - Email address of the user
 * @returns {string|null} Query string or null if invalid
 */
function createMembershipQuery(userEmail) {
  if (typeof userEmail !== 'string') {
    return null;
  }

  const normalizedEmail = userEmail.trim();
  if (!normalizedEmail) {
    return null;
  }

  if (/['\r\n]/u.test(normalizedEmail)) {
    return null;
  }

  return `member_key_id == '${normalizedEmail}'`;
}

/**
 * Verifies if a user is a member of the specified Google Workspace group
 * @param {string} accessToken - OAuth access token
 * @param {string} userEmail - Email address of the user
 * @returns {Promise<boolean>} True if user is a member or if no group is specified
 */
async function checkGroupMembership(accessToken, userEmail) {
  try {
    if (!GOOGLE_GROUP_RESTRICTION_ENABLED) {
      return true;
    }

    if (!accessToken || typeof accessToken !== 'string') {
      logger.error(
        '[checkGroupMembership] Missing or invalid access token for group membership check',
      );
      return false;
    }

    const membershipQuery = createMembershipQuery(userEmail);
    if (!membershipQuery) {
      logger.error(
        '[checkGroupMembership] Missing or invalid user email for group membership query',
      );
      return false;
    }

    const client = createCloudIdentityClient(accessToken);
    const groupName = await getGroupResourceName(client, GOOGLE_WORKSPACE_GROUP);
    if (!groupName) {
      logger.error(
        '[checkGroupMembership] Could not find group resource name for configured group',
        {
          groupEmail: GOOGLE_WORKSPACE_GROUP,
        },
      );
      return false;
    }

    const response = await client.groups.memberships.checkTransitiveMembership({
      parent: groupName,
      query: membershipQuery,
    });

    return Boolean(response?.data?.hasMembership);
  } catch (error) {
    logger.error('[checkGroupMembership] Error checking group membership:', {
      error: error.response?.data || error,
    });
    return false;
  }
}

/**
 * Handles Google OAuth login process with group membership verification
 * @param {string} accessToken - OAuth access token
 * @param {string} refreshToken - OAuth refresh token
 * @param {Object} params - OAuth token response parameters
 * @param {Object} profile - User profile from Google
 * @param {Function} done - Passport callback function
 */
async function googleLogin(accessToken, refreshToken, params, profile, done) {
  try {
    // Group membership check is moved to middleware
    const socialLoginCallback = (err, user) => {
      if (err) {
        return done(err);
      }
      done(null, user, { accessToken });
    };

    return socialLogin('google', getProfileDetails)(
      accessToken,
      refreshToken,
      params?.id_token ?? null,
      profile,
      socialLoginCallback,
    );
  } catch (error) {
    logger.error('[googleLogin] Error processing Google login:', error);
    return done(error);
  }
}

/**
 * Returns the required OAuth scopes for Google authentication
 * @returns {string[]} Array of OAuth scopes
 */
const getGoogleScopes = () => {
  return [...GOOGLE_SCOPES];
};

module.exports = {
  strategy: () =>
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${process.env.DOMAIN_SERVER}${process.env.GOOGLE_CALLBACK_URL}`,
        proxy: true,
      },
      googleLogin,
    ),
  getGoogleScopes,
  checkGroupMembership,
};
