const { logger } = require('@librechat/data-schemas');
const { isTokenRetired, TOKEN_RETIREMENT_FIELDS } = require('@librechat/api');
const { getUserById } = require('~/models');

/**
 * Refuses a required-enrollment setup token that a later account event has retired.
 *
 * The setup token is the one credential in the enrollment chain carrying no server-side nonce, so
 * nothing else can date it. Password recovery revokes the credential it was minted for and strands
 * the staged enrollment, but a holder of the old credential could otherwise present a setup token
 * from before the reset, stage a secret of their own, and promote it over the recovered account.
 * The later steps are already covered, because recovery clears the nonce hashes they consume.
 *
 * Runs after `requireTwoFactorSetupToken`, which verifies the signature and stamps the request.
 */
const blockRetiredSetupToken = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Invalid or expired two-factor setup token' });
    }

    const user = await getUserById(userId, TOKEN_RETIREMENT_FIELDS);
    if (!user) {
      return res.status(401).json({ message: 'Invalid or expired two-factor setup token' });
    }

    if (isTokenRetired(req.twoFactorSetupIssuedAt, user)) {
      logger.warn(
        `[blockRetiredSetupToken] Setup token predates enrollment or password reset: userId=${userId}`,
      );
      return res.status(401).json({ message: 'Invalid or expired two-factor setup token' });
    }

    next();
  } catch (err) {
    logger.error('[blockRetiredSetupToken]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = blockRetiredSetupToken;
