const { inspectContent, extractConversationTitleContent } = require('@librechat/api');

const SAFE_CONVERSATION_TITLE = 'New Chat';

/**
 * Applies the independently configurable conversation-title policy immediately
 * before a title crosses a cache, event, or persistence boundary.
 *
 * A blocked candidate is replaced with a fixed fallback. If an operator's
 * custom title policy also blocks that fallback, the caller must suppress the
 * title write by handling the returned `null`.
 *
 * @param {ServerRequest} req
 * @param {unknown} candidate
 * @param {string} [fallback]
 * @returns {string|null}
 */
function resolveConversationTitle(req, candidate, fallback = SAFE_CONVERSATION_TITLE) {
  const titlePolicy = req?.config?.filters?.conversationTitles?.pii;
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return null;
  }
  if (titlePolicy == null) {
    return candidate;
  }

  const filters = req.config.filters;
  const isAllowed = (title) =>
    inspectContent(extractConversationTitleContent({ title }), { filters }) == null;

  if (isAllowed(candidate)) {
    return candidate;
  }
  if (
    typeof fallback === 'string' &&
    fallback.length > 0 &&
    fallback !== candidate &&
    isAllowed(fallback)
  ) {
    return fallback;
  }
  return null;
}

module.exports = {
  SAFE_CONVERSATION_TITLE,
  resolveConversationTitle,
};
