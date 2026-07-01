const { parseStepStatus, summarizeStep } = require('./prompt');

/**
 * The planning loop for a long-horizon job. Given the job and the text a step
 * produced, it decides the job's next lifecycle status and computes the state
 * carried into the following step.
 *
 * Keeping this pure (no I/O) makes the multi-step behavior unit-testable and
 * keeps the worker focused on claim/lock orchestration.
 */

/**
 * Decides the outcome of a completed step.
 *
 * A job finishes when the model signals completion (`STATUS: DONE`) or when the
 * step cap is reached; otherwise it stays `running` so the next worker tick
 * advances it. The returned `checkpoint` is the job's working memory: the
 * accumulated step summaries plus the last message id used to chain turns.
 *
 * @param {object} params
 * @param {{ maxSteps: number }} params.job - The job being advanced.
 * @param {number} params.stepIndex - Zero-based index of the step just run.
 * @param {string} params.responseText - The assistant text the step produced.
 * @param {string[]} params.priorSummaries - Summaries from earlier steps.
 * @param {string} [params.messageId] - Message id of the step's response.
 * @returns {{
 *   isDone: boolean,
 *   status: 'running' | 'done',
 *   summary: string,
 *   currentStep: number,
 *   checkpoint: { stepSummaries: string[], lastMessageId?: string },
 * }}
 */
function decideNextStep({ job, stepIndex, responseText, priorSummaries, messageId }) {
  const signal = parseStepStatus(responseText);
  const summary = summarizeStep(responseText);
  const stepSummaries = [...priorSummaries, summary];

  const reachedCap = stepIndex + 1 >= job.maxSteps;
  const isDone = signal === 'DONE' || reachedCap;

  return {
    isDone,
    status: isDone ? 'done' : 'running',
    summary,
    currentStep: stepIndex + 1,
    checkpoint: { stepSummaries, lastMessageId: messageId },
  };
}

/**
 * Whether a step may run at all given the step cap. Guards against a job whose
 * `currentStep` already sits at or beyond `maxSteps` (e.g. after a config
 * change) so the worker finalizes it instead of running an over-cap step.
 *
 * @param {{ currentStep?: number, maxSteps: number }} job
 * @returns {boolean}
 */
function canRunStep(job) {
  return (job.currentStep ?? 0) < job.maxSteps;
}

module.exports = { decideNextStep, canRunStep };
