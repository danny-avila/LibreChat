const denyRestrictedChatActions = (req, res, next) => {
  const { isRegenerate, isContinued, editedContent, responseMessageId, editedMessageId } =
    req.body ?? {};

  if (isRegenerate === true && isContinued !== true) {
    return res.status(403).json({ error: 'Regenerating responses is disabled' });
  }

  if (
    isContinued !== true &&
    (editedContent != null || responseMessageId != null || editedMessageId != null)
  ) {
    return res.status(403).json({ error: 'Editing responses is disabled' });
  }

  next();
};

module.exports = {
  denyRestrictedChatActions,
};
