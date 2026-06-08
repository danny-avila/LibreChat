const { logger } = require('@librechat/data-schemas');
const { applyMessagePiiRedaction } = require('@librechat/api');
const denyRequest = require('./denyRequest');

/**
 * Pre-redact `req.body.text` before downstream middleware sees it. Mounted
 * before `moderateText` on the agent chat route so credentials that match
 * a configured `messagePiiFilter` pattern never leave the server toward
 * the OpenAI moderation endpoint, the agent run, or MongoDB.
 *
 * `block` mode returns a 400 here via `denyRequest`, mirroring how
 * `moderateText` rejects flagged content. `warn` mutates the text and
 * attaches the matches on `req._piiPreRedactMatches` so the controller
 * can emit the `pii_matches` SSE event for the warn toast after the
 * job (and its streamId) exist. `silent` mutates without attaching.
 *
 * Runs in addition to the browser-side prefilter in `useClientPiiFilter`
 * to cover API callers and any UI bypass.
 */
async function messagePiiFilter(req, res, next) {
  const config = req.config?.messagePiiFilter;
  if (config == null || typeof config.onMatch !== 'string') {
    return next();
  }
  const text = req.body?.text;
  if (typeof text !== 'string' || text.length === 0) {
    return next();
  }
  try {
    const result = applyMessagePiiRedaction(text, config);
    if (result.matches.length === 0) {
      return next();
    }
    if (config.onMatch === 'block') {
      const labels = result.matches.map((m) => m.patternLabel).join(', ');
      logger.info(
        `[messagePiiFilter] blocked send (patterns=${result.matches
          .map((m) => m.patternId)
          .join(',')})`,
      );
      return await denyRequest(req, res, {
        message: `Message blocked by PII filter: ${labels}. Edit and retry.`,
      });
    }
    req.body.text = result.text;
    if (config.onMatch === 'warn') {
      req._piiPreRedactMatches = result.matches;
    }
    logger.info(
      `[messagePiiFilter] redacted ${result.matches.length} match(es) (mode=${config.onMatch}, patterns=${result.matches
        .map((m) => m.patternId)
        .join(',')})`,
    );
    return next();
  } catch (err) {
    logger.error('[messagePiiFilter] middleware error:', err);
    return next();
  }
}

module.exports = messagePiiFilter;
