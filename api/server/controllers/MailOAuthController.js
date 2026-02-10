const jwt = require('jsonwebtoken');
const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { MailTokenStorage } = require('~/server/services/MailOAuth');

const GMAIL_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

const OUTLOOK_TOKEN_URL = 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token';
const OUTLOOK_SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'offline_access',
].join(' ');

function getOutlookAuthUrl(tenantId) {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
}

function getOutlookTokenUrl(tenantId) {
  return OUTLOOK_TOKEN_URL.replace('{tenant}', tenantId);
}

/**
 * GET /api/mail/status
 * Returns connection status for each mail provider.
 */
async function getMailConnectionStatus(req, res) {
  try {
    const userId = req.user.id;
    const [gmail, outlook] = await Promise.all([
      MailTokenStorage.hasConnection({ userId, provider: 'gmail' }),
      MailTokenStorage.hasConnection({ userId, provider: 'outlook' }),
    ]);
    res.json({ gmail, outlook });
  } catch (error) {
    logger.error('[MailOAuth] Error getting status:', error);
    res.status(500).json({ error: 'Failed to get mail connection status' });
  }
}

/**
 * GET /api/mail/connect/:provider
 * Initiates OAuth flow by redirecting to the provider's consent screen.
 */
async function initiateMailOAuth(req, res) {
  const { provider } = req.params;
  const userId = req.user.id;

  const state = jwt.sign(
    { userId, provider, timestamp: Date.now() },
    process.env.JWT_SECRET,
    { expiresIn: '10m' },
  );

  if (provider === 'gmail') {
    const clientId = process.env.MAIL_GMAIL_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({ error: 'Gmail OAuth is not configured' });
    }

    const callbackUrl = `${process.env.DOMAIN_SERVER}/api/mail/callback/gmail`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return res.redirect(`${GMAIL_AUTH_URL}?${params.toString()}`);
  }

  if (provider === 'outlook') {
    const clientId = process.env.MAIL_OUTLOOK_CLIENT_ID;
    if (!clientId) {
      return res.status(400).json({ error: 'Outlook OAuth is not configured' });
    }

    const tenantId = process.env.MAIL_OUTLOOK_TENANT_ID || 'common';
    const callbackUrl = `${process.env.DOMAIN_SERVER}/api/mail/callback/outlook`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: OUTLOOK_SCOPES,
      response_mode: 'query',
      state,
    });

    return res.redirect(`${getOutlookAuthUrl(tenantId)}?${params.toString()}`);
  }

  res.status(400).json({ error: `Unknown provider: ${provider}` });
}

/**
 * GET /api/mail/callback/:provider
 * Handles OAuth callback: exchanges code for tokens and stores them.
 */
async function handleMailOAuthCallback(req, res) {
  const { provider } = req.params;
  const { code, state, error: oauthError } = req.query;
  const clientUrl = process.env.DOMAIN_CLIENT || 'http://localhost:3090';

  if (oauthError) {
    logger.error(`[MailOAuth][${provider}] OAuth error: ${oauthError}`);
    return res.redirect(`${clientUrl}/oauth/error`);
  }

  if (!code || !state) {
    logger.error(`[MailOAuth][${provider}] Missing code or state`);
    return res.redirect(`${clientUrl}/oauth/error`);
  }

  // Validate state (CSRF protection)
  let statePayload;
  try {
    statePayload = jwt.verify(state, process.env.JWT_SECRET);
  } catch (err) {
    logger.error(`[MailOAuth][${provider}] Invalid state token:`, err.message);
    return res.redirect(`${clientUrl}/oauth/error`);
  }

  if (statePayload.provider !== provider) {
    logger.error(`[MailOAuth] State provider mismatch: ${statePayload.provider} vs ${provider}`);
    return res.redirect(`${clientUrl}/oauth/error`);
  }

  const userId = statePayload.userId;

  try {
    let tokenResponse;

    if (provider === 'gmail') {
      tokenResponse = await axios.post(GMAIL_TOKEN_URL, new URLSearchParams({
        code,
        client_id: process.env.MAIL_GMAIL_CLIENT_ID,
        client_secret: process.env.MAIL_GMAIL_CLIENT_SECRET,
        redirect_uri: `${process.env.DOMAIN_SERVER}/api/mail/callback/gmail`,
        grant_type: 'authorization_code',
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } else if (provider === 'outlook') {
      const tenantId = process.env.MAIL_OUTLOOK_TENANT_ID || 'common';
      tokenResponse = await axios.post(getOutlookTokenUrl(tenantId), new URLSearchParams({
        code,
        client_id: process.env.MAIL_OUTLOOK_CLIENT_ID,
        client_secret: process.env.MAIL_OUTLOOK_CLIENT_SECRET,
        redirect_uri: `${process.env.DOMAIN_SERVER}/api/mail/callback/outlook`,
        grant_type: 'authorization_code',
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } else {
      return res.redirect(`${clientUrl}/oauth/error`);
    }

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    await MailTokenStorage.storeTokens({
      userId,
      provider,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresIn: expires_in || 3600,
    });

    logger.info(`[MailOAuth][${provider}][User: ${userId}] Successfully connected`);
    return res.redirect(`${clientUrl}/oauth/success?serverName=Email`);
  } catch (error) {
    logger.error(`[MailOAuth][${provider}] Token exchange error:`, error?.response?.data || error.message);
    return res.redirect(`${clientUrl}/oauth/error`);
  }
}

/**
 * POST /api/mail/disconnect/:provider
 * Disconnects a mail provider by deleting stored tokens.
 */
async function disconnectMailProvider(req, res) {
  const { provider } = req.params;
  const userId = req.user.id;

  if (provider !== 'gmail' && provider !== 'outlook') {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  try {
    await MailTokenStorage.deleteTokens({ userId, provider });
    logger.info(`[MailOAuth][${provider}][User: ${userId}] Disconnected`);
    res.json({ success: true });
  } catch (error) {
    logger.error(`[MailOAuth][${provider}][User: ${userId}] Error disconnecting:`, error);
    res.status(500).json({ error: 'Failed to disconnect mail provider' });
  }
}

module.exports = {
  getMailConnectionStatus,
  initiateMailOAuth,
  handleMailOAuthCallback,
  disconnectMailProvider,
};
