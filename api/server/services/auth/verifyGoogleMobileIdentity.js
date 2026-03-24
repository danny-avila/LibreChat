async function verifyGoogleMobileIdentity(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Google ID token is required');
  }

  // Load lazily so the codebase remains testable before dependencies are installed.
  const { OAuth2Client } = require('google-auth-library');
  const audience = process.env.GOOGLE_IOS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;

  if (!audience) {
    throw new Error('Missing Google mobile client ID configuration');
  }

  const client = new OAuth2Client(audience);
  const ticket = await client.verifyIdToken({
    idToken,
    audience,
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw new Error('Invalid Google token payload');
  }

  return {
    id: payload.sub,
    email: payload.email,
    avatarUrl: payload.picture,
    username: payload.given_name || payload.email.split('@')[0],
    name:
      payload.name ||
      [payload.given_name, payload.family_name].filter(Boolean).join(' ') ||
      payload.email,
    emailVerified: Boolean(payload.email_verified),
  };
}

module.exports = verifyGoogleMobileIdentity;
