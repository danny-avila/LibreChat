const { assertModelBoundContent, ContentTraversalLimitError } = require('@librechat/api');

const PAGE_LIMIT = 100;
const MAX_THREAD_PAGES = 100;
const MAX_THREAD_USER_MESSAGES = PAGE_LIMIT * MAX_THREAD_PAGES;

function shouldInspectAssistant({ filters, legacyPii }) {
  return (
    legacyPii != null ||
    filters?.agentInstructions?.pii != null ||
    filters?.toolArguments?.pii != null ||
    filters?.modelParameters?.pii != null ||
    filters?.files?.pii != null
  );
}

function shouldInspectThread({ filters, legacyPii }) {
  return legacyPii != null || filters?.messages?.pii != null || filters?.files?.pii != null;
}

function normalizeUserMessage(message) {
  if (message?.role !== 'user') {
    return null;
  }
  return {
    isCreatedByUser: true,
    role: 'user',
    name: message.name,
    content: message.content,
    file_ids: message.file_ids,
    attachments: message.attachments,
  };
}

async function loadThreadUserMessages(openai, threadId) {
  if (!threadId) {
    return [];
  }

  const userMessages = [];
  const seenCursors = new Set();
  let visitedPages = 0;
  let page = await openai.beta.threads.messages.list(threadId, {
    limit: PAGE_LIMIT,
    order: 'asc',
  });

  while (page != null) {
    visitedPages++;
    if (visitedPages > MAX_THREAD_PAGES) {
      throw new ContentTraversalLimitError();
    }
    const data = Array.isArray(page.data) ? page.data : [];
    for (const message of data) {
      const normalized = normalizeUserMessage(message);
      if (normalized != null) {
        userMessages.push(normalized);
        if (userMessages.length > MAX_THREAD_USER_MESSAGES) {
          throw new ContentTraversalLimitError();
        }
      }
    }

    const cursor = page.last_id ?? data[data.length - 1]?.id;
    if (typeof page.hasNextPage === 'function') {
      if (!page.hasNextPage()) {
        break;
      }
      if (visitedPages >= MAX_THREAD_PAGES) {
        throw new ContentTraversalLimitError();
      }
      if (typeof page.getNextPage !== 'function') {
        throw new ContentTraversalLimitError();
      }
      if (typeof cursor !== 'string' || cursor.length === 0 || seenCursors.has(cursor)) {
        throw new ContentTraversalLimitError();
      }
      seenCursors.add(cursor);
      page = await page.getNextPage();
      continue;
    }

    if (page.has_more !== true) {
      break;
    }
    if (visitedPages >= MAX_THREAD_PAGES) {
      throw new ContentTraversalLimitError();
    }
    if (typeof cursor !== 'string' || cursor.length === 0 || seenCursors.has(cursor)) {
      throw new ContentTraversalLimitError();
    }
    seenCursors.add(cursor);
    page = await openai.beta.threads.messages.list(threadId, {
      limit: PAGE_LIMIT,
      order: 'asc',
      after: cursor,
    });
  }

  return userMessages;
}

/**
 * Re-applies current policy to remote Assistants state that can become
 * model-bound without appearing in the current chat request.
 */
async function preflightAssistantRunContent({ req, openai, assistantId, threadId }) {
  const filters = req.config?.filters;
  const legacyPii = req.config?.messageFilter?.pii;
  const inspectAssistant = shouldInspectAssistant({ filters, legacyPii });
  const inspectThread = shouldInspectThread({ filters, legacyPii }) && threadId != null;

  if (!inspectAssistant && !inspectThread) {
    return undefined;
  }

  const [assistant, storedMessages] = await Promise.all([
    inspectAssistant ? openai.beta.assistants.retrieve(assistantId) : Promise.resolve(undefined),
    inspectThread ? loadThreadUserMessages(openai, threadId) : Promise.resolve([]),
  ]);

  assertModelBoundContent({
    filters,
    legacyPii,
    assistants: assistant == null ? undefined : [assistant],
    storedMessages,
  });

  return assistant;
}

module.exports = {
  loadThreadUserMessages,
  preflightAssistantRunContent,
};
