/**
 * Prompt construction + completion detection for long-horizon jobs.
 *
 * Each job step is a single agent turn. The step prompt carries the original
 * goal plus a running digest of prior step summaries (the job's working
 * memory), and instructs the model to end its reply with a status line the
 * planner can parse:
 *
 *   STATUS: CONTINUE   → more work remains; the worker schedules another step
 *   STATUS: DONE       → the goal is complete; the worker finalizes the job
 *
 * Keeping the control signal in the model's own output (rather than a separate
 * classifier call) keeps a step to exactly one LLM round-trip.
 */

const STATUS_LINE = /STATUS:\s*(CONTINUE|DONE)\b/i;
const { CLIENT_OP_LINE, parseClientOp } = require('./clientOp');

/** Lines from the internal step prompt that should never appear in the chat UI. */
const PROMPT_ECHO_LINE =
  /^(You are working on a long-running task|TASK GOAL:|WORK DONE SO FAR|LOCAL FILE OPERATION RESULT|Do the first meaningful step|Continue with the next single step|You have at most \d+ step\(s\) left|End your reply with exactly one status line|If you need the user's connected local folder|When you emit CLIENT_OP|CLIENT_OP: \{"op")/;

/**
 * Builds the instruction text for the next step.
 *
 * @param {{ goal: string, stepSummaries?: string[], stepIndex: number, maxSteps: number, lastClientOpResult?: { op?: { op?: string, path?: string }, result?: unknown } }} params
 * @returns {string}
 */
function buildStepPrompt({ goal, stepSummaries = [], stepIndex, maxSteps, lastClientOpResult }) {
  const isFirst = stepIndex === 0;
  const remaining = maxSteps - stepIndex;

  const lines = [];
  lines.push(`You are working on a long-running task, one step at a time.`);
  lines.push('');
  lines.push(`TASK GOAL:`);
  lines.push(goal);
  lines.push('');

  if (!isFirst && stepSummaries.length > 0) {
    lines.push(`WORK DONE SO FAR (most recent last):`);
    stepSummaries.forEach((summary, i) => {
      lines.push(`${i + 1}. ${summary}`);
    });
    lines.push('');
  }

  if (lastClientOpResult?.op?.op) {
    const opLabel = lastClientOpResult.op.path
      ? `${lastClientOpResult.op.op} on "${lastClientOpResult.op.path}"`
      : lastClientOpResult.op.op;
    lines.push(`LOCAL FILE OPERATION RESULT (${opLabel}):`);
    const serialized =
      typeof lastClientOpResult.result === 'string'
        ? lastClientOpResult.result
        : JSON.stringify(lastClientOpResult.result ?? null, null, 2);
    lines.push(serialized.slice(0, 8000));
    lines.push('');
  }

  lines.push(
    isFirst
      ? `Do the first meaningful step toward the goal now.`
      : `Continue with the next single step toward the goal now.`,
  );
  lines.push(
    `You have at most ${remaining} step(s) left. When the goal is fully achieved, ` +
      `provide the final consolidated result.`,
  );
  lines.push('');
  lines.push(
    `End your reply with exactly one status line on its own line: ` +
      `"STATUS: CONTINUE" if more steps are needed, or "STATUS: DONE" if the goal is complete.`,
  );
  lines.push('');
  lines.push(
    `If you need the user's connected local folder, request exactly one browser operation ` +
      `on its own line before the status line:`,
  );
  lines.push(`CLIENT_OP: {"op":"listDir","path":""}`);
  lines.push(`CLIENT_OP: {"op":"listDir","path":"relative/subfolder"}`);
  lines.push(`CLIENT_OP: {"op":"readFile","path":"relative/file.txt"}`);
  lines.push(`CLIENT_OP: {"op":"writeFile","path":"relative/file.txt","content":"file body"}`);
  lines.push(
    `When you emit CLIENT_OP, do not also emit STATUS on that step — the job will pause until ` +
      `the browser completes the operation.`,
  );
  lines.push('');
  lines.push(
    `Always include 1–3 plain-language sentences for the user BEFORE any CLIENT_OP or STATUS line. ` +
      `Never reply with only a control line.`,
  );
  if (lastClientOpResult?.op?.op) {
    lines.push(
      `The LOCAL FILE OPERATION RESULT above is authoritative — summarize it for the user and ` +
        `answer the TASK GOAL before you emit STATUS: DONE.`,
    );
  }

  return lines.join('\n');
}

/**
 * Reads the planner status from a step's response text. Defaults to CONTINUE
 * when no explicit line is present so an unclear step doesn't silently end the
 * job (the maxSteps cap still bounds the total).
 *
 * @param {string} responseText
 * @returns {'CONTINUE' | 'DONE'}
 */
function parseStepStatus(responseText) {
  if (typeof responseText !== 'string') {
    return 'CONTINUE';
  }
  const match = responseText.match(STATUS_LINE);
  if (!match) {
    return 'CONTINUE';
  }
  return match[1].toUpperCase() === 'DONE' ? 'DONE' : 'CONTINUE';
}

/**
 * Produces a short, single-line summary of a step's output for the job's
 * working memory. Strips the status line and truncates to keep the checkpoint
 * small.
 *
 * @param {string} responseText
 * @param {number} [maxLength=280]
 * @returns {string}
 */
function summarizeStep(responseText, maxLength = 280) {
  if (typeof responseText !== 'string' || responseText.length === 0) {
    return '(no output)';
  }
  const withoutStatus = responseText.replace(STATUS_LINE, '').replace(CLIENT_OP_LINE, '').trim();
  const singleLine = withoutStatus.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine || '(no output)';
  }
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

/**
 * User-visible text for a job step's user bubble. Step 0 shows the original
 * goal; later steps are headless continuations with no user bubble.
 *
 * @param {{ stepIndex: number, goal: string }} params
 * @returns {string | null}
 */
function buildDisplayUserText({ stepIndex, goal }) {
  if (stepIndex === 0 && typeof goal === 'string' && goal.trim().length > 0) {
    return goal.trim();
  }
  return null;
}

/**
 * Strips planner control lines and leaked internal instructions before a step
 * is shown in the conversation history.
 *
 * @param {string} responseText
 * @returns {string}
 */
function formatStepResponseForDisplay(responseText) {
  if (typeof responseText !== 'string' || responseText.length === 0) {
    return '';
  }

  const lines = responseText.replace(STATUS_LINE, '').replace(CLIENT_OP_LINE, '').split('\n');
  const kept = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && PROMPT_ECHO_LINE.test(trimmed)) {
      continue;
    }
    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {unknown} result
 * @param {{ goal?: string }} [options]
 * @returns {string}
 */
function formatListDirResultForDisplay(result, options = {}) {
  if (!Array.isArray(result) || result.length === 0) {
    return 'Your connected folder is empty.';
  }

  const files = result.filter((entry) => entry?.kind === 'file').map((entry) => entry.name);
  const dirs = result.filter((entry) => entry?.kind === 'directory').map((entry) => entry.name);
  const wantsTxtOnly = /\btxt\b/i.test(options.goal ?? '');

  if (wantsTxtOnly) {
    const txtFiles = files.filter((name) => name.toLowerCase().endsWith('.txt'));
    if (txtFiles.length === 0) {
      return 'No .txt files found in your connected folder.';
    }
    return [
      '**.txt files in your connected folder:**',
      ...txtFiles.map((name) => `- ${name}`),
    ].join('\n');
  }

  const lines = [];
  if (files.length > 0) {
    lines.push('**Files:**', ...files.map((name) => `- ${name}`));
  }
  if (dirs.length > 0) {
    lines.push('**Folders:**', ...dirs.map((name) => `- ${name}/`));
  }
  return lines.join('\n');
}

/**
 * @param {{ op?: { op?: string, path?: string }, result?: unknown }} lastClientOpResult
 * @param {{ goal?: string }} [options]
 * @returns {string}
 */
function formatClientOpResultForDisplay(lastClientOpResult, options = {}) {
  const op = lastClientOpResult?.op;
  const result = lastClientOpResult?.result;
  if (!op?.op) {
    return '';
  }

  switch (op.op) {
    case 'listDir':
      return formatListDirResultForDisplay(result, options);
    case 'readFile':
      if (typeof result === 'string') {
        return op.path ? `**${op.path}:**\n\n${result}` : result;
      }
      break;
    case 'writeFile':
      return op.path
        ? `Created **${op.path}** in your connected folder.`
        : 'Created a file in your connected folder.';
    default:
      break;
  }

  return typeof result === 'string' ? result : JSON.stringify(result ?? null, null, 2);
}

/**
 * @param {{ op: string, path?: string }} clientOp
 * @returns {string}
 */
function formatPendingClientOpForDisplay(clientOp) {
  switch (clientOp.op) {
    case 'listDir':
      return 'Checking your connected folder…';
    case 'readFile':
      return clientOp.path
        ? `Reading **${clientOp.path}** from your connected folder…`
        : 'Reading a file from your connected folder…';
    case 'writeFile':
      return clientOp.path
        ? `Writing **${clientOp.path}** in your connected folder…`
        : 'Writing a file in your connected folder…';
    default:
      return 'Working with your connected folder…';
  }
}

/**
 * User-visible assistant text for a job step — strips control lines, fills in
 * friendly copy when the model only emitted CLIENT_OP / STATUS, and can
 * synthesize a directory listing from the latest local file op result.
 *
 * @param {string} responseText
 * @param {{ lastClientOpResult?: { op?: { op?: string, path?: string }, result?: unknown }, goal?: string }} [options]
 * @returns {string}
 */
function buildDisplayResponseText(responseText, options = {}) {
  const trimmed = typeof responseText === 'string' ? responseText.trim() : '';
  const display = formatStepResponseForDisplay(trimmed);

  if (display.length > 0) {
    return display;
  }

  const clientOp = parseClientOp(trimmed);
  if (clientOp) {
    return formatPendingClientOpForDisplay(clientOp);
  }

  if (STATUS_LINE.test(trimmed) && options.lastClientOpResult) {
    return formatClientOpResultForDisplay(options.lastClientOpResult, options);
  }

  return display;
}

/**
 * @param {{ text?: string, content?: Array<{ type?: string, text?: string }>, messageId?: string }} message
 * @param {string} text
 */
function patchMessageTextFields(message, text) {
  const next = { ...message, text };
  if (!Array.isArray(message.content)) {
    return next;
  }

  let replacedTextPart = false;
  next.content = message.content.map((part) => {
    if (part?.type === 'text') {
      replacedTextPart = true;
      return { ...part, text };
    }
    return part;
  });

  if (!replacedTextPart && text.length > 0) {
    next.content = [{ type: 'text', text }, ...message.content];
  }

  return next;
}

module.exports = {
  buildStepPrompt,
  parseStepStatus,
  summarizeStep,
  buildDisplayUserText,
  formatStepResponseForDisplay,
  buildDisplayResponseText,
  formatClientOpResultForDisplay,
  patchMessageTextFields,
};
