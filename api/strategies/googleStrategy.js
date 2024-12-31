const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const axios = require('axios');
const socialLogin = require('./socialLogin');
const { logger } = require('~/config');

/**
 * Extracts and formats user profile details from Google OAuth profile
 * @param {Object} profile - The profile object from Google OAuth
 * @returns {Object} Formatted user profile details
 */
const getProfileDetails = (profile) => ({
  email: profile.emails[0].value,
  id: profile.id,
  avatarUrl: profile.photos[0].value,
  username: profile.name.givenName,
  name: `${profile.name.givenName} ${profile.name.familyName}`,
  emailVerified: profile.emails[0].verified,
});

/**
 * Retrieves the resource name for a Google Workspace group
 * @param {string} accessToken - OAuth access token
 * @param {string} groupEmail - Email address of the group
 * @returns {Promise<string|null>} Group resource name or null if not found
 */
async function getGroupResourceName(accessToken, groupEmail) {
  try {
    const response = await axios.get(
      'https://cloudidentity.googleapis.com/v1/groups:lookup',
      {
        params: {
          'groupKey.id': groupEmail,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    return response.data.name;
  } catch (error) {
    logger.error('[getGroupResourceName] Error looking up group:', error.response?.data || error);
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

    const response = await axios.get(
      `https://cloudidentity.googleapis.com/v1/${groupName}/memberships:checkTransitiveMembership`,
      {
        params: { query: `member_key_id == '${userEmail}'` },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    return response.data.hasMembership || false;
  } catch (error) {
    logger.error(
      '[checkGroupMembership] Error checking group membership:',
      { userEmail, error: error.response?.data || error }
    );
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
    const userEmail = profile.emails[0].value;
    const isMember = await checkGroupMembership(accessToken, userEmail);

    if (!isMember) {
      return done(null, false);
    }

    const socialLoginCallback = (err, user) => {
      if (err) {
        return done(err);
      }
      done(null, user);
    };

    return socialLogin('google', getProfileDetails)(
      accessToken,
      refreshToken,
      profile,
      socialLoginCallback
    );
  } catch (error) {
    return done(error);
  }
}

module.exports = () =>
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.DOMAIN_SERVER}${process.env.GOOGLE_CALLBACK_URL}`,
      proxy: true,
    },
    googleLogin,
  );
