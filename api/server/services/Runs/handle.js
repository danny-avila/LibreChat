const { RunStatus } = require('librechat-data-provider');
const RunManager = require('./RunManager');
/**
 * Creates a run on a thread using the OpenAI API.
 *
 * @param {Object} params - The parameters for creating a run.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {string} params.thread_id - The ID of the thread to run.
 * @param {Object} params.body - The body of the request to create a run.
 * @param {string} params.body.assistant_id - The ID of the assistant to use for this run.
 * @param {string} [params.body.model] - Optional. The ID of the model to be used for this run.
 * @param {string} [params.body.instructions] - Optional. Override the default system message of the assistant.
 * @param {Object[]} [params.body.tools] - Optional. Override the tools the assistant can use for this run.
 * @param {string[]} [params.body.file_ids] - Optional. List of File IDs the assistant can use for this run.
 * @param {Object} [params.body.metadata] - Optional. Metadata for the run.
 * @return {Promise<Run>} A promise that resolves to the created run object.
 */
async function createRun({ openai, thread_id, body }) {
  const run = await openai.beta.threads.runs.create(thread_id, body);
  return run;
}

/**
 * Delays the execution for a specified number of milliseconds.
 *
 * @param {number} ms - The number of milliseconds to delay.
 * @return {Promise<void>} A promise that resolves after the specified delay.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for a run to complete by repeatedly checking its status. It uses a RunManager instance to fetch and manage run steps based on the run status.
 *
 * @param {Object} params - The parameters for the waitForRun function.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {string} params.run_id - The ID of the run to wait for.
 * @param {string} params.thread_id - The ID of the thread associated with the run.
 * @param {RunManager} params.runManager - The RunManager instance to manage run steps.
 * @param {number} params.pollIntervalMs - The interval for polling the run status, default is 500 milliseconds.
 * @return {Promise<Run>} A promise that resolves to the last fetched run object.
 */
async function waitForRun({
  openai,
  run_id,
  thread_id,
  runManager,
  pollIntervalMs = 750,
  timeout = 18000,
}) {
  let timeElapsed = 0;
  let run;

  // this runManager will be passed in from the caller

  while (timeElapsed < timeout) {
    run = await openai.beta.threads.runs.retrieve(thread_id, run_id);
    console.log(`Run status: ${run.status}`);

    if (![RunStatus.IN_PROGRESS, RunStatus.QUEUED].includes(run.status)) {
      await runManager.fetchRunSteps({
        openai,
        thread_id: thread_id,
        run_id: run_id,
        runStatus: run.status,
        final: true,
      });
      break;
    }

    // may use in future; for now, just fetch from the final status
    await runManager.fetchRunSteps({
      openai,
      thread_id: thread_id,
      run_id: run_id,
      runStatus: run.status,
    });

    await sleep(pollIntervalMs);
    timeElapsed += pollIntervalMs;
  }

  return run;
}

/**
 * Retrieves all steps of a run.
 *
 * @deprecated: Steps are handled with runAssistant now.
 * @param {Object} params - The parameters for the retrieveRunSteps function.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {string} params.thread_id - The ID of the thread associated with the run.
 * @param {string} params.run_id - The ID of the run to retrieve steps for.
 * @return {Promise<RunStep[]>} A promise that resolves to an array of RunStep objects.
 */
async function _retrieveRunSteps({ openai, thread_id, run_id }) {
  const runSteps = await openai.beta.threads.runs.steps.list(thread_id, run_id);
  return runSteps;
}

/**
 * Initializes a RunManager with handlers, then invokes waitForRun to monitor and manage an OpenAI run.
 *
 * @deprecated Use runAssistant instead.
 * @param {Object} params - The parameters for managing and monitoring the run.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {string} params.run_id - The ID of the run to manage and monitor.
 * @param {string} params.thread_id - The ID of the thread associated with the run.
 * @return {Promise<Object>} A promise that resolves to an object containing the run and managed steps.
 */
async function _handleRun({ openai, run_id, thread_id }) {
  let steps = [];
  let messages = [];
  const runManager = new RunManager({
    // 'in_progress': async ({ step, final, isLast }) => {
    //   // Define logic for handling steps with 'in_progress' status
    // },
    // 'queued': async ({ step, final, isLast }) => {
    //   // Define logic for handling steps with 'queued' status
    // },
    final: async ({ step, runStatus, stepsByStatus }) => {
      console.log(`Final step for ${run_id} with status ${runStatus}`);
      console.dir(step, { depth: null });

      const promises = [];
      promises.push(
        openai.beta.threads.messages.list(thread_id, {
          order: 'asc',
        }),
      );

      // const finalSteps = stepsByStatus[runStatus];
      // for (const stepPromise of finalSteps) {
      //   promises.push(stepPromise);
      // }

      // loop across all statuses
      for (const [_status, stepsPromises] of Object.entries(stepsByStatus)) {
        promises.push(...stepsPromises);
      }

      const resolved = await Promise.all(promises);
      const res = resolved.shift();
      messages = res.data.filter((msg) => msg.run_id === run_id);
      resolved.push(step);
      steps = resolved;
    },
  });

  const run = await waitForRun({
    openai,
    run_id,
    thread_id,
    runManager,
    pollIntervalMs: 750,
    timeout: 60000,
  });
  const actions = [];
  if (run.required_action) {
    const { submit_tool_outputs } = run.required_action;
    submit_tool_outputs.tool_calls.forEach((item) => {
      const functionCall = item.function;
      const args = JSON.parse(functionCall.arguments);
      actions.push({
        tool: functionCall.name,
        toolInput: args,
        toolCallId: item.id,
        run_id,
        thread_id,
      });
    });
  }

  return { run, steps, messages, actions };
}

module.exports = {
  sleep,
  createRun,
  waitForRun,
  // _handleRun,
  // retrieveRunSteps,
};
