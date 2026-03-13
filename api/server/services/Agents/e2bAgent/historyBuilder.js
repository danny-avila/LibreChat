const { countTokens } = require('@librechat/api');

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}__/gi;

const DEFAULTS = {
  messageWindowSize: 10,
  historyMaxTokens: 12000,
  summarySnippetChars: 220,
  summaryMaxUserItems: 6,
  summaryMaxAssistantItems: 5,
};

const cleanText = (text) => (text || '').replace(UUID_PATTERN, '').replace(/\s+/g, ' ').trim();

const clip = (text, maxChars) => {
  if (!text) {
    return '';
  }
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
};

const formatSummary = ({ userItems, assistantItems, firstUserGoal }) => {
  const lines = [];
  lines.push('## Prior Conversation Summary (compressed)');
  if (firstUserGoal) {
    lines.push(`- Initial goal: ${firstUserGoal}`);
  }
  if (userItems.length > 0) {
    lines.push('- Earlier user requests:');
    userItems.forEach((item, idx) => lines.push(`  ${idx + 1}. ${item}`));
  }
  if (assistantItems.length > 0) {
    lines.push('- Earlier assistant outcomes:');
    assistantItems.forEach((item, idx) => lines.push(`  ${idx + 1}. ${item}`));
  }
  lines.push('- Keep this as compressed memory; rely on recent turns for exact details.');
  return lines.join('\n');
};

async function countHistoryTokens(history, model) {
  let total = 0;
  for (const msg of history) {
    total += await countTokens(msg.content || '', model);
  }
  return total;
}

async function buildE2BHistory({ dbMessages, currentUserMessageId, model, config = {} }) {
  const opts = {
    ...DEFAULTS,
    ...config,
  };

  const normalized = dbMessages
    .filter((msg) => msg.messageId !== currentUserMessageId)
    .map((msg) => ({
      role: msg.isCreatedByUser ? 'user' : 'assistant',
      content: cleanText(msg.text),
      createdAt: msg.createdAt,
    }))
    .filter((msg) => msg.content.length > 0);

  const rawHistory = normalized.map(({ role, content }) => ({ role, content }));
  const rawTokenEstimate = await countHistoryTokens(rawHistory, model);

  if (rawHistory.length <= opts.messageWindowSize && rawTokenEstimate <= opts.historyMaxTokens) {
    return {
      history: rawHistory,
      stats: {
        rawMessages: rawHistory.length,
        outputMessages: rawHistory.length,
        rawTokens: rawTokenEstimate,
        outputTokens: rawTokenEstimate,
        compressed: false,
        summaryInserted: false,
      },
    };
  }

  const firstUser = normalized.find((m) => m.role === 'user');
  const firstAnchor = firstUser
    ? { role: 'user', content: clip(firstUser.content, opts.summarySnippetChars) }
    : null;

  const tail = normalized
    .slice(-opts.messageWindowSize)
    .map(({ role, content }) => ({ role, content }));

  const cutoffIndex = Math.max(0, normalized.length - opts.messageWindowSize);
  const older = normalized.slice(0, cutoffIndex);

  const olderUserItems = older
    .filter((m) => m.role === 'user')
    .slice(-opts.summaryMaxUserItems)
    .map((m) => clip(m.content, opts.summarySnippetChars));

  const olderAssistantItems = older
    .filter((m) => m.role === 'assistant')
    .slice(-opts.summaryMaxAssistantItems)
    .map((m) => clip(m.content, opts.summarySnippetChars));

  const summaryContent = formatSummary({
    userItems: olderUserItems,
    assistantItems: olderAssistantItems,
    firstUserGoal: firstAnchor?.content,
  });

  const summaryMessage = { role: 'system', content: summaryContent };

  const output = [];
  if (firstAnchor && (!tail[0] || tail[0].content !== firstAnchor.content)) {
    output.push(firstAnchor);
  }
  output.push(summaryMessage, ...tail);

  let outputTokens = await countHistoryTokens(output, model);

  // Budget trimming: remove oldest non-system message first, keep summary and the most recent turns.
  while (outputTokens > opts.historyMaxTokens && output.length > 2) {
    const removableIndex = output.findIndex((msg, idx) => idx > 0 && msg.role !== 'system');
    if (removableIndex === -1) {
      break;
    }
    output.splice(removableIndex, 1);
    outputTokens = await countHistoryTokens(output, model);
  }

  // If still over budget, shorten summary content.
  if (outputTokens > opts.historyMaxTokens) {
    const summaryIdx = output.findIndex((msg) => msg.role === 'system' && msg.content.includes('Prior Conversation Summary'));
    if (summaryIdx >= 0) {
      const reducedSummary = clip(output[summaryIdx].content, 1200);
      output[summaryIdx] = { ...output[summaryIdx], content: reducedSummary };
      outputTokens = await countHistoryTokens(output, model);
    }
  }

  return {
    history: output,
    stats: {
      rawMessages: rawHistory.length,
      outputMessages: output.length,
      rawTokens: rawTokenEstimate,
      outputTokens,
      compressed: true,
      summaryInserted: true,
    },
  };
}

module.exports = {
  buildE2BHistory,
};
