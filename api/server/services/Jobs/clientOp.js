const VALID_OPS = new Set(['listDir', 'readFile', 'writeFile']);

/** Matches a single-line CLIENT_OP JSON directive from the model. */
const CLIENT_OP_LINE = /CLIENT_OP:\s*(\{[\s\S]*?\})\s*$/m;

/** Collapses "." / "./" to the connected folder root before the client executes the op. */
function normalizeClientOpPath(path) {
  const trimmed = path.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed === '.') {
    return '';
  }
  const segments = trimmed.split('/').filter(Boolean);
  const resolved = [];
  for (const segment of segments) {
    if (segment === '.') {
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join('/');
}

/**
 * Parses a local file operation the model requested the browser to perform.
 *
 * @param {string} responseText
 * @returns {{ op: string, path?: string, content?: string, contentRef?: string } | null}
 */
function parseClientOp(responseText) {
  if (typeof responseText !== 'string') {
    return null;
  }
  const match = responseText.match(CLIENT_OP_LINE);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || typeof parsed !== 'object' || !VALID_OPS.has(parsed.op)) {
      return null;
    }
    const op = {
      op: parsed.op,
      path: typeof parsed.path === 'string' ? normalizeClientOpPath(parsed.path) : undefined,
      content: typeof parsed.content === 'string' ? parsed.content : undefined,
      contentRef: typeof parsed.contentRef === 'string' ? parsed.contentRef : undefined,
    };
    if (op.op === 'writeFile' && !op.path) {
      return null;
    }
    if ((op.op === 'readFile' || op.op === 'listDir') && op.path === undefined) {
      if (op.op === 'listDir') {
        op.path = '';
      } else {
        return null;
      }
    }
    return op;
  } catch {
    return null;
  }
}

module.exports = { parseClientOp, CLIENT_OP_LINE };
