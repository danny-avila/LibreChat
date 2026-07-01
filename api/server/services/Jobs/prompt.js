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

/**
 * Builds the instruction text for the next step.
 *
 * @param {{ goal: string, stepSummaries?: string[], stepIndex: number, maxSteps: number }} params
 * @returns {string}
 */
function buildStepPrompt({ goal, stepSummaries = [], stepIndex, maxSteps }) {
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
  const withoutStatus = responseText.replace(STATUS_LINE, '').trim();
  const singleLine = withoutStatus.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxLength) {
    return singleLine || '(no output)';
  }
  return `${singleLine.slice(0, maxLength - 1)}…`;
}

module.exports = { buildStepPrompt, parseStepStatus, summarizeStep };
