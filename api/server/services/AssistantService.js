const RunManager = require('./Runs/RunMananger');

/**
 * @typedef {Object} Message
 * @property {string} id - The identifier of the message.
 * @property {string} object - The object type, always 'thread.message'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the message was created.
 * @property {string} thread_id - The thread ID that this message belongs to.
 * @property {string} role - The entity that produced the message. One of 'user' or 'assistant'.
 * @property {Object[]} content - The content of the message in an array of text and/or images.
 * @property {string} content[].type - The type of content, either 'text' or 'image_file'.
 * @property {Object} [content[].text] - The text content, present if type is 'text'.
 * @property {string} content[].text.value - The data that makes up the text.
 * @property {Object[]} [content[].text.annotations] - Annotations for the text content.
 * @property {Object} [content[].image_file] - The image file content, present if type is 'image_file'.
 * @property {string} content[].image_file.file_id - The File ID of the image in the message content.
 * @property {string[]} [file_ids] - Optional list of File IDs for the message.
 * @property {string|null} [assistant_id] - If applicable, the ID of the assistant that authored this message.
 * @property {string|null} [run_id] - If applicable, the ID of the run associated with the authoring of this message.
 * @property {Object} [metadata] - Optional metadata for the message, a map of key-value pairs.
 */

/**
 * @typedef {Object} FunctionTool
 * @property {string} type - The type of tool, 'function'.
 * @property {Object} function - The function definition.
 * @property {string} function.description - A description of what the function does.
 * @property {string} function.name - The name of the function to be called.
 * @property {Object} function.parameters - The parameters the function accepts, described as a JSON Schema object.
 */

/**
 * @typedef {Object} Tool
 * @property {string} type - The type of tool, can be 'code_interpreter', 'retrieval', or 'function'.
 * @property {FunctionTool} [function] - The function tool, present if type is 'function'.
 */

/**
 * @typedef {Object} Run
 * @property {string} id - The identifier of the run.
 * @property {string} object - The object type, always 'thread.run'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the run was created.
 * @property {string} thread_id - The ID of the thread that was executed on as a part of this run.
 * @property {string} assistant_id - The ID of the assistant used for execution of this run.
 * @property {string} status - The status of the run (e.g., 'queued', 'completed').
 * @property {Object} [required_action] - Details on the action required to continue the run.
 * @property {string} required_action.type - The type of required action, always 'submit_tool_outputs'.
 * @property {Object} required_action.submit_tool_outputs - Details on the tool outputs needed for the run to continue.
 * @property {Object[]} required_action.submit_tool_outputs.tool_calls - A list of the relevant tool calls.
 * @property {string} required_action.submit_tool_outputs.tool_calls[].id - The ID of the tool call.
 * @property {string} required_action.submit_tool_outputs.tool_calls[].type - The type of tool call the output is required for, always 'function'.
 * @property {Object} required_action.submit_tool_outputs.tool_calls[].function - The function definition.
 * @property {string} required_action.submit_tool_outputs.tool_calls[].function.name - The name of the function.
 * @property {string} required_action.submit_tool_outputs.tool_calls[].function.arguments - The arguments that the model expects you to pass to the function.
 * @property {Object} [last_error] - The last error associated with this run.
 * @property {string} last_error.code - One of 'server_error' or 'rate_limit_exceeded'.
 * @property {string} last_error.message - A human-readable description of the error.
 * @property {number} [expires_at] - The Unix timestamp (in seconds) for when the run will expire.
 * @property {number} [started_at] - The Unix timestamp (in seconds) for when the run was started.
 * @property {number} [cancelled_at] - The Unix timestamp (in seconds) for when the run was cancelled.
 * @property {number} [failed_at] - The Unix timestamp (in seconds) for when the run failed.
 * @property {number} [completed_at] - The Unix timestamp (in seconds) for when the run was completed.
 * @property {string} [model] - The model that the assistant used for this run.
 * @property {string} [instructions] - The instructions that the assistant used for this run.
 * @property {Tool[]} [tools] - The list of tools used for this run.
 * @property {string[]} [file_ids] - The list of File IDs used for this run.
 * @property {Object} [metadata] - Metadata associated with this run.
 */

/**
 * @typedef {Object} RunStep
 * @property {string} id - The identifier of the run step.
 * @property {string} object - The object type, always 'thread.run.step'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the run step was created.
 * @property {string} assistant_id - The ID of the assistant associated with the run step.
 * @property {string} thread_id - The ID of the thread that was run.
 * @property {string} run_id - The ID of the run that this run step is a part of.
 * @property {string} type - The type of run step, either 'message_creation' or 'tool_calls'.
 * @property {string} status - The status of the run step, can be 'in_progress', 'cancelled', 'failed', 'completed', or 'expired'.
 * @property {Object} step_details - The details of the run step.
 * @property {Object} [last_error] - The last error associated with this run step.
 * @property {string} last_error.code - One of 'server_error' or 'rate_limit_exceeded'.
 * @property {string} last_error.message - A human-readable description of the error.
 * @property {number} [expired_at] - The Unix timestamp (in seconds) for when the run step expired.
 * @property {number} [cancelled_at] - The Unix timestamp (in seconds) for when the run step was cancelled.
 * @property {number} [failed_at] - The Unix timestamp (in seconds) for when the run step failed.
 * @property {number} [completed_at] - The Unix timestamp (in seconds) for when the run step completed.
 * @property {Object} [metadata] - Metadata associated with this run step, a map of up to 16 key-value pairs.
 */

/**
 * @typedef {Object} StepMessage
 * @property {Message} message - The complete message object created by the step.
 * @property {string} id - The identifier of the run step.
 * @property {string} object - The object type, always 'thread.run.step'.
 * @property {number} created_at - The Unix timestamp (in seconds) for when the run step was created.
 * @property {string} assistant_id - The ID of the assistant associated with the run step.
 * @property {string} thread_id - The ID of the thread that was run.
 * @property {string} run_id - The ID of the run that this run step is a part of.
 * @property {string} type - The type of run step, either 'message_creation' or 'tool_calls'.
 * @property {string} status - The status of the run step, can be 'in_progress', 'cancelled', 'failed', 'completed', or 'expired'.
 * @property {Object} step_details - The details of the run step.
 * @property {Object} [last_error] - The last error associated with this run step.
 * @property {string} last_error.code - One of 'server_error' or 'rate_limit_exceeded'.
 * @property {string} last_error.message - A human-readable description of the error.
 * @property {number} [expired_at] - The Unix timestamp (in seconds) for when the run step expired.
 * @property {number} [cancelled_at] - The Unix timestamp (in seconds) for when the run step was cancelled.
 * @property {number} [failed_at] - The Unix timestamp (in seconds) for when the run step failed.
 * @property {number} [completed_at] - The Unix timestamp (in seconds) for when the run step completed.
 * @property {Object} [metadata] - Metadata associated with this run step, a map of up to 16 key-value pairs.
 */

/**
 * Initializes a new thread or adds messages to an existing thread.
 *
 * @param {Object} params - The parameters for initializing a thread.
 * @param {OpenAI} params.openai - The OpenAI client instance.
 * @param {Object} params.body - The body of the request.
 * @param {Message[]} params.body.messages - A list of messages to start the thread with.
 * @param {Object} [params.body.metadata] - Optional metadata for the thread.
 * @param {string} [params.thread_id] - Optional existing thread ID. If provided, a message will be added to this thread.
 * @return {Promise<Thread>} A promise that resolves to the newly created thread object or the updated thread object.
 */
async function initThread({ openai, body, thread_id: _thread_id }) {
  let thread = {};
  const messages = [];
  if (_thread_id) {
    const message = await openai.beta.threads.messages.create(_thread_id, body.messages[0]);
    messages.push(message);
  } else {
    thread = await openai.beta.threads.create(body);
  }

  const thread_id = _thread_id ?? thread.id;
  return { messages, thread_id, ...thread };
}

/**
 * Creates a run on a thread using the OpenAI API.
 *
 * @param {Object} params - The parameters for creating a run.
 * @param {OpenAI} params.openai - The OpenAI client instance.
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

// /**
//  * Retrieves all steps of a run.
//  *
//  * @param {Object} params - The parameters for the retrieveRunSteps function.
//  * @param {OpenAI} params.openai - The OpenAI client instance.
//  * @param {string} params.thread_id - The ID of the thread associated with the run.
//  * @param {string} params.run_id - The ID of the run to retrieve steps for.
//  * @return {Promise<RunStep[]>} A promise that resolves to an array of RunStep objects.
//  */
// async function retrieveRunSteps({ openai, thread_id, run_id }) {
//   const runSteps = await openai.beta.threads.runs.steps.list(thread_id, run_id);
//   return runSteps;
// }

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
 * @param {OpenAI} params.openai - The OpenAI client instance.
 * @param {string} params.run_id - The ID of the run to wait for.
 * @param {string} params.thread_id - The ID of the thread associated with the run.
 * @param {RunManager} params.runManager - The RunManager instance to manage run steps.
 * @param {number} params.pollIntervalMs - The interval for polling the run status, default is 500 milliseconds.
 * @return {Promise<Run>} A promise that resolves to the last fetched run object.
 */
async function waitForRun({ openai, run_id, thread_id, runManager, pollIntervalMs = 500 }) {
  const timeout = 18000; // 18 seconds
  let timeElapsed = 0;
  let run;

  // this runManager will be passed in from the caller
  // const runManager = new RunManager({
  //   'in_progress': (step) => { /* ... */ },
  //   'queued': (step) => { /* ... */ },
  // });

  while (timeElapsed < timeout) {
    run = await openai.beta.threads.runs.retrieve(thread_id, run_id);
    console.log(`Run status: ${run.status}`);

    if (!['in_progress', 'queued'].includes(run.status)) {
      await runManager.fetchRunSteps({
        openai,
        thread_id: thread_id,
        run_id: run_id,
        runStatus: run.status,
        final: true,
      });
      break;
    }

    // may use in future
    // await runManager.fetchRunSteps({
    //   openai,
    //   thread_id: thread_id,
    //   run_id: run_id,
    //   runStatus: run.status,
    // });

    await sleep(pollIntervalMs);
    timeElapsed += pollIntervalMs;
  }

  return run;
}

/**
 * Retrieves the response from an OpenAI run.
 *
 * @param {Object} params - The parameters for getting the response.
 * @param {OpenAI} params.openai - The OpenAI client instance.
 * @param {string} params.run_id - The ID of the run to get the response for.
 * @param {string} params.thread_id - The ID of the thread associated with the run.
 * @return {Promise<OpenAIAssistantFinish | OpenAIAssistantAction[] | Message[] | RequiredActionFunctionToolCall[]>}
 */
async function getResponse({ openai, run_id, thread_id }) {
  const run = await waitForRun({ openai, run_id, thread_id, pollIntervalMs: 500 });

  if (run.status === 'completed') {
    const messages = await openai.beta.threads.messages.list(thread_id, {
      order: 'asc',
    });
    const newMessages = messages.data.filter((msg) => msg.run_id === run_id);

    return newMessages;
  } else if (run.status === 'requires_action') {
    const actions = [];
    run.required_action?.submit_tool_outputs.tool_calls.forEach((item) => {
      const functionCall = item.function;
      const args = JSON.parse(functionCall.arguments);
      actions.push({
        tool: functionCall.name,
        toolInput: args,
        toolCallId: item.id,
        log: '',
        run_id,
        thread_id,
      });
    });

    return actions;
  }

  const runInfo = JSON.stringify(run, null, 2);
  throw new Error(`Unexpected run status ${run.status}.\nFull run info:\n\n${runInfo}`);
}

/**
 * Initializes a RunManager with handlers, then invokes waitForRun to monitor and manage an OpenAI run.
 *
 * @param {Object} params - The parameters for managing and monitoring the run.
 * @param {OpenAI} params.openai - The OpenAI client instance.
 * @param {string} params.run_id - The ID of the run to manage and monitor.
 * @param {string} params.thread_id - The ID of the thread associated with the run.
 * @return {Promise<Object>} A promise that resolves to an object containing the run and managed steps.
 */
async function handleRun({ openai, run_id, thread_id }) {
  let steps;
  let messages;
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

      const finalSteps = stepsByStatus[runStatus];

      // loop across all statuses, may use in the future
      // for (const [_status, stepsPromises] of Object.entries(stepsByStatus)) {
      //   promises.push(...stepsPromises);
      // }
      for (const stepPromise of finalSteps) {
        promises.push(stepPromise);
      }

      const resolved = await Promise.all(promises);
      const res = resolved.shift();
      messages = res.data.filter((msg) => msg.run_id === run_id);
      resolved.push(step);
      steps = resolved;
    },
  });

  const run = await waitForRun({ openai, run_id, thread_id, runManager, pollIntervalMs: 500 });

  return { run, steps, messages };
}

/**
 * Maps messages to their corresponding steps. Steps with message creation will be paired with their messages,
 * while steps without message creation will be returned as is.
 *
 * @param {RunStep[]} steps - An array of steps from the run.
 * @param {Message[]} messages - An array of message objects.
 * @returns {(StepMessage | RunStep)[]} An array where each element is either a step with its corresponding message (StepMessage) or a step without a message (RunStep).
 */
function mapMessagesToSteps(steps, messages) {
  // Create a map of messages indexed by their IDs for efficient lookup
  const messageMap = messages.reduce((acc, msg) => {
    acc[msg.id] = msg;
    return acc;
  }, {});

  // Map each step to its corresponding message, or return the step as is if no message ID is present
  return steps.map((step) => {
    const messageId = step.step_details?.message_creation?.message_id;

    if (messageId && messageMap[messageId]) {
      return { step, message: messageMap[messageId] };
    }
    return step;
  });
}

module.exports = {
  initThread,
  createRun,
  waitForRun,
  getResponse,
  handleRun,
  mapMessagesToSteps,
};
