const { logger } = require('@librechat/data-schemas');
const { isTarsConfigured, fetchTarsDomainById } = require('@librechat/api');

/**
 * When a chat request carries a pwc_tars `domain_id` (a selected 專用腦) and the
 * user has not supplied their own promptPrefix, inject the domain's description
 * as the system prompt. The domain is resolved from the user's authorized
 * domains, so a user can never inject one outside their role grants. Non-fatal:
 * any failure falls through to a normal chat.
 */
const injectTarsDomain = async (req, res, next) => {
  try {
    const domainId = req.body?.domain_id;
    const tarsId = req.user?.tarsId;
    if (!domainId || !tarsId || !isTarsConfigured() || req.body?.promptPrefix) {
      return next();
    }

    const domain = await fetchTarsDomainById(tarsId, domainId);
    if (domain?.description) {
      req.body.promptPrefix = domain.description;
    }
    return next();
  } catch (error) {
    logger.error('[injectTarsDomain] Failed to inject pwc_tars domain instructions', error);
    return next();
  }
};

module.exports = injectTarsDomain;
