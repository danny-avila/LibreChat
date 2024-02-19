const { logger } = require('~/config');

/**
 * @typedef {import('openai').OpenAI} OpenAI
 * @typedef {import('../AssistantService').RunStep} RunStep
 * @callback StepHandler
 * @param {RunStep} step - A single run step to be processed.
 */

/**
 * @typedef {Object} RunManager
 * Manages the retrieval and processing of run steps based on run status.
 * @property {Set<string>} seenSteps - A set of IDs for steps that have already been seen.
 * @property {Object.<string, Promise<RunStep[]>>} stepsByStatus - Steps organized by run status.
 * @property {Object.<string, StepHandler>} handlers - Handlers for different run statuses.
 * @property {Object.<string, Promise>} lastStepPromiseByStatus - Last processed step's promise by run status.
 * @property {Function} fetchRunSteps - Fetches run steps based on run status.
 * @property {Function} handleStep - Handles a run step based on its status.
 */

/**
 * Manages the retrieval and processing of run steps based on run status.
 */
class RunManager {
  /**
   * Initializes the RunManager instance.
   * @param {Object.<string, StepHandler>} handlers - An object containing handler functions for different run statuses.
   */
  constructor(handlers = {}) {
    this.seenSteps = new Set();
    this.stepsByStatus = {};
    this.handlers = handlers;
    this.lastStepPromiseByStatus = {};
  }

  /**
   * Fetches run steps once and filters out already seen steps.
   * @param {Object} params - The parameters for fetching run steps.
   * @param {OpenAI} params.openai - The OpenAI client instance.
   * @param {string} params.thread_id - The ID of the thread associated with the run.
   * @param {string} params.run_id - The ID of the run to retrieve steps for.
   * @param {string} params.runStatus - The status of the run.
   * @param {boolean} [params.final] - The end of the run polling loop, due to `requires_action`, `cancelling`, `cancelled`, `failed`, `completed`, or `expired` statuses.
   */
  async fetchRunSteps({ openai, thread_id, run_id, runStatus, final = false }) {
    // const { data: steps, first_id, last_id, has_more } = await openai.beta.threads.runs.steps.list(thread_id, run_id);
    const { data: _steps } = await openai.beta.threads.runs.steps.list(
      thread_id,
      run_id,
      {},
      {
        timeout: 3000,
        maxRetries: 5,
      },
    );
    const steps = _steps.sort((a, b) => a.created_at - b.created_at);
    for (const [i, step] of steps.entries()) {
      if (!final && this.seenSteps.has(`${step.id}-${step.status}`)) {
        continue;
      }

      const isLast = i === steps.length - 1;
      this.seenSteps.add(`${step.id}-${step.status}`);
      this.stepsByStatus[runStatus] = this.stepsByStatus[runStatus] || [];

      const currentStepPromise = (async () => {
        await (this.lastStepPromiseByStatus[runStatus] || Promise.resolve());
        return this.handleStep({ step, runStatus, final, isLast });
      })();

      if (final && isLast) {
        return await currentStepPromise;
      }

      if (step.type === 'tool_calls') {
        await currentStepPromise;
      }
      if (step.type === 'message_creation' && step.status === 'completed') {
        await currentStepPromise;
      }

      this.lastStepPromiseByStatus[runStatus] = currentStepPromise;
      this.stepsByStatus[runStatus].push(currentStepPromise);
    }
  }

  /**
   * Handles a run step based on its status.
   * @param {Object} params - The parameters for handling a run step.
   * @param {RunStep} params.step - The run step to handle.
   * @param {string} params.runStatus - The status of the run step.
   * @param {string} params.final - The final run status (no further polling will occur)
   * @param {boolean} params.isLast - Whether the current step is the last step of the list.
   */
  async handleStep({ step, runStatus, final, isLast }) {
    if (this.handlers[runStatus]) {
      return await this.handlers[runStatus]({ step, final, isLast });
    }

    if (final && isLast && this.handlers['final']) {
      return await this.handlers['final']({ step, runStatus, stepsByStatus: this.stepsByStatus });
    }

    logger.debug(`[RunManager] Default handler for ${step.id} with status \`${runStatus}\``, {
      step,
      runStatus,
      final,
      isLast,
    });
    return step;
  }
}

module.exports = RunManager;
