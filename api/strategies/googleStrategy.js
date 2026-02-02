const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { cloudidentity_v1, auth } = require('@googleapis/cloudidentity');
const socialLogin = require('./socialLogin');
const { logger } = require('~/config');

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
 * @param {string} accessToken - OAuth access token
 * @param {string} groupEmail - Email address of the group
 * @returns {Promise<string|null>} Group resource name or null if not found
 */
async function getGroupResourceName(accessToken, groupEmail) {
  try {
    const client = createCloudIdentityClient(accessToken);
    const response = await client.groups.lookup({
      'groupKey.id': groupEmail,
    });
    return response.data.name;
  } catch (error) {
    logger.error(
      `[getGroupResourceName] Error looking up group: ${groupEmail}`,
      error.response?.data || error,
    );
    return null;
  }
}

/**
 * Verifies if a user is a member of the specified Google Workspace group
 * @param {string} accessToken - OAuth access token
 * @param {string} userEmail - Email address of the user
 * @returns {Promise<boolean>} True if user is a member or if no group is specified
 */
async function checkGroupMembership(accessToken, userEmail) {
  try {
    const allowedGroup = process.env.GOOGLE_WORKSPACE_GROUP;
    if (!allowedGroup) {
      return true;
    }

    const groupName = await getGroupResourceName(accessToken, allowedGroup);
    if (!groupName) {
      logger.error('[checkGroupMembership] Could not find group resource name');
      return false;
    }

    const client = createCloudIdentityClient(accessToken);
    const response = await client.groups.memberships.checkTransitiveMembership({
      parent: groupName,
      query: `member_key_id == '${userEmail}'`,
    });

    return response.data.hasMembership || false;
  } catch (error) {
    logger.error('[checkGroupMembership] Error checking group membership:', {
      userEmail,
      error: error.response?.data || error,
    });
    return false;
  }
}

/**
 * Handles Google OAuth login process with group membership verification
 * @param {string} accessToken - OAuth access token
 * @param {string} refreshToken - OAuth refresh token
 * @param {Object} profile - User profile from Google
 * @param {Function} done - Passport callback function
 */
async function googleLogin(accessToken, refreshToken, profile, done) {
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
      null,
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
  const scopes = ['openid', 'profile', 'email'];
  if (process.env.GOOGLE_WORKSPACE_GROUP) {
    scopes.push('https://www.googleapis.com/auth/cloud-identity.groups.readonly');
  }
  return scopes;
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
