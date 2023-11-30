const path = require('path');
const mime = require('mime/lite');
const { createFile } = require('~/models');
const { TextStream } = require('~/app/clients');
const RunManager = require('./Runs/RunMananger');
const { processActions } = require('~/server/services/ToolService');
const { convertToWebP } = require('~/server/services/Files/images');
const { isEnabled, createOnProgress, sendMessage } = require('~/server/utils');

const { GPTS_DOWNLOAD_IMAGES = 'false' } = process.env;
const imageRegex = /\.(jpg|jpeg|png|gif|webp)$/i;

/**
 * Sorts, processes, and flattens messages to a single string.
 *
 * @param {OpenAIClient} openai - The OpenAI client instance.
 * @returns {void}
 */
async function createOnTextProgress(openai) {
  const { onProgress: progressCallback, getPartialText } = createOnProgress({
    onProgress: () => {
      // todo: save partialText to db
    },
  });

  openai.getPartialText = getPartialText;
  openai.progressCallback = progressCallback;
}

/**
 * Initializes a new thread or adds messages to an existing thread.
 *
 * @param {Object} params - The parameters for initializing a thread.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {Object} params.body - The body of the request.
 * @param {ThreadMessage[]} params.body.messages - A list of messages to start the thread with.
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

// /**
//  * Retrieves all steps of a run.
//  *
//  * @param {Object} params - The parameters for the retrieveRunSteps function.
//  * @param {OpenAIClient} params.openai - The OpenAI client instance.
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
 * Retrieves the response from an OpenAI run.
 *
 * @param {Object} params - The parameters for getting the response.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {string} params.run_id - The ID of the run to get the response for.
 * @param {string} params.thread_id - The ID of the thread associated with the run.
 * @return {Promise<OpenAIAssistantFinish | OpenAIAssistantAction[] | ThreadMessage[] | RequiredActionFunctionToolCall[]>}
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

/**
 * Filters the steps to keep only the most recent instance of each unique step.
 * @param {RunStep[]} steps - The array of RunSteps to filter.
 * @return {RunStep[]} The filtered array of RunSteps.
 */
function filterSteps(steps = []) {
  if (steps.length <= 1) {
    return steps;
  }
  const stepMap = new Map();

  steps.forEach((step) => {
    if (!step) {
      return;
    }

    const effectiveTimestamp = Math.max(
      step.created_at,
      step.expired_at || 0,
      step.cancelled_at || 0,
      step.failed_at || 0,
      step.completed_at || 0,
    );

    if (!stepMap.has(step.id) || effectiveTimestamp > stepMap.get(step.id).effectiveTimestamp) {
      const latestStep = { ...step, effectiveTimestamp };
      if (latestStep.last_error) {
        // testing to see if we ever step into this
      }
      stepMap.set(step.id, latestStep);
    }
  });

  return Array.from(stepMap.values()).map((step) => {
    delete step.effectiveTimestamp;
    return step;
  });
}

/**
 * @callback InProgressFunction
 * @param {Object} params - The parameters for the in progress step.
 * @param {RunStep} params.step - The step object with details about the message creation.
 * @returns {Promise<void>} - A promise that resolves when the step is processed.
 */

function hasToolCallChanged(previousCall, currentCall) {
  return JSON.stringify(previousCall) !== JSON.stringify(currentCall);
}

/**
 * Creates a handler function for steps in progress, specifically for
 * processing messages and managing seen completed messages.
 *
 * @param {OpenAIClient} openai - The OpenAI client instance.
 * @param {string} thread_id - The ID of the thread the run is in.
 * @param {ThreadMessage[]} messages - The accumulated messages for the run.
 * @return {InProgressFunction} a function to handle steps in progress.
 */
function createInProgressHandler(openai, thread_id, messages) {
  openai.index = 0;
  openai.mappedOrder = new Map();
  openai.seenToolCalls = new Map();
  openai.seenCompletedMessages = new Set();

  /**
   * The in_progress function for handling message creation steps.
   *
   * @type {InProgressFunction}
   */
  async function inProgress({ step }) {
    if (step.type === 'tool_calls') {
      const { tool_calls } = step.step_details;

      tool_calls.forEach((toolCall) => {
        const previousCall = openai.seenToolCalls.get(toolCall.id);

        // If the tool call is new or has changed
        if (!previousCall || hasToolCallChanged(previousCall, toolCall)) {
          let toolCallIndex = openai.mappedOrder.get(toolCall.id);
          if (toolCallIndex === undefined) {
            // New tool call
            toolCallIndex = openai.index;
            openai.mappedOrder.set(toolCall.id, openai.index);
            openai.index++;
          }

          sendMessage(openai.res, {
            toolCall,
            index: toolCallIndex,
            id: toolCall.id,
          });

          // Update the stored tool call
          openai.seenToolCalls.set(toolCall.id, toolCall);
        }
      });
    } else if (step.type === 'message_creation' && step.status === 'completed') {
      const { message_id } = step.step_details.message_creation;
      if (openai.seenCompletedMessages.has(message_id)) {
        return;
      }

      openai.seenCompletedMessages.add(message_id);

      const message = await openai.beta.threads.messages.retrieve(thread_id, message_id);
      messages.push(message);

      let messageIndex = openai.mappedOrder.get(step.id);
      if (messageIndex === undefined) {
        // New message
        messageIndex = openai.index;
        openai.mappedOrder.set(step.id, openai.index);
        openai.index++;
      }

      // Process the message
      const onProgress = openai.progressCallback.call(openai, {
        res: openai.res,
        index: messageIndex,
        id: step.id,
      });

      const result = await processMessages(openai, [message]);
      const stream = new TextStream(result.text, { delay: 5 });
      await stream.processTextStream(onProgress);
    }
  }

  return inProgress;
}

/**
 * Initializes a RunManager with handlers, then invokes waitForRun to monitor and manage an OpenAI run.
 *
 * @param {Object} params - The parameters for managing and monitoring the run.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {string} params.run_id - The ID of the run to manage and monitor.
 * @param {string} params.thread_id - The ID of the thread associated with the run.
 * @param {RunStep[]} params.accumulatedSteps - The accumulated steps for the run.
 * @param {ThreadMessage[]} params.accumulatedMessages - The accumulated messages for the run.
 * @return {Promise<Object>} A promise that resolves to an object containing the run and managed steps.
 */
async function handleRun({
  openai,
  run_id,
  thread_id,
  accumulatedSteps = [],
  accumulatedMessages = [],
}) {
  let steps = accumulatedSteps;
  let messages = accumulatedMessages;
  const in_progress = createInProgressHandler(openai, thread_id, messages);

  const runManager = new RunManager({
    in_progress,
    final: async ({ step, runStatus, stepsByStatus }) => {
      console.log(`Final step for ${run_id} with status ${runStatus}`);
      console.dir(step, { depth: null });

      const promises = [];
      // promises.push(
      //   openai.beta.threads.messages.list(thread_id, {
      //     order: 'asc',
      //   }),
      // );

      // const finalSteps = stepsByStatus[runStatus];
      // for (const stepPromise of finalSteps) {
      //   promises.push(stepPromise);
      // }

      // loop across all statuses
      for (const [_status, stepsPromises] of Object.entries(stepsByStatus)) {
        promises.push(...stepsPromises);
      }

      const resolved = await Promise.all(promises);
      await in_progress({ step });
      // const res = resolved.shift();
      // messages = messages.concat(res.data.filter((msg) => msg && msg.run_id === run_id));
      resolved.push(step);
      steps = filterSteps(steps.concat(resolved));
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

  if (!run.required_action) {
    // const { messages: sortedMessages, text } = await processMessages(openai, messages);
    // return { run, steps, messages: sortedMessages, text };
    const sortedMessages = messages.sort((a, b) => a.created_at - b.created_at);
    return { run, steps, messages: sortedMessages };
  }

  const { submit_tool_outputs } = run.required_action;
  const actions = submit_tool_outputs.tool_calls.map((item) => {
    const functionCall = item.function;
    const args = JSON.parse(functionCall.arguments);
    return {
      tool: functionCall.name,
      toolInput: args,
      toolCallId: item.id,
      run_id,
      thread_id,
    };
  });

  const outputs = await processActions(openai, actions);

  const toolRun = await openai.beta.threads.runs.submitToolOutputs(run.thread_id, run.id, outputs);

  // Recursive call with accumulated steps and messages
  return await handleRun({
    openai,
    run_id: toolRun.id,
    thread_id,
    accumulatedSteps: steps,
    accumulatedMessages: messages,
  });
}

/**
 * Maps messages to their corresponding steps. Steps with message creation will be paired with their messages,
 * while steps without message creation will be returned as is.
 *
 * @param {RunStep[]} steps - An array of steps from the run.
 * @param {ThreadMessage[]} messages - An array of message objects.
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

/**
 * Retrieves and processes a file based on its type.
 *
 * @param {OpenAIClient} openai - The OpenAI client instance.
 * @param {string} file_id - The ID of the file to retrieve.
 * @param {string} basename - The basename of the file (if image); e.g., 'image.jpg'.
 * @returns {Promise<{filepath: string, bytes: number, width?: number, height?: number}>} The path, size, and dimensions (if image) of the processed file.
 */
async function retrieveAndProcessFile(openai, file_id, basename) {
  const downloadImages = isEnabled(GPTS_DOWNLOAD_IMAGES);

  if (!downloadImages || !basename) {
    const _file = await openai.files.retrieve(file_id);
    const filepath = `/api/files/download/${file_id}`;
    const file = {
      ..._file,
      type: mime.getType(_file.filename),
      filepath,
      usage: 1,
      file_id,
    };
    createFile(file, true);
    return file;
  }

  const extname = path.extname(basename);
  if (downloadImages && basename && extname) {
    const response = await openai.files.content(file_id);
    const data = await response.arrayBuffer();
    // Convert the binary data to a Buffer
    const dataBuffer = Buffer.from(data);
    const _file = await convertToWebP(openai.req, dataBuffer, 'high', `${file_id}${extname}`);
    const file = {
      ..._file,
      type: 'image/webp',
      usage: 1,
      file_id,
    };
    createFile(file, true);
    return file;
  } else {
    console.log('Not an image or invalid extension: ', basename);
  }

  // return isImage ? await convertToWebP(dataBuffer) : await doSomethingElse(dataBuffer);
}

/**
 * Sorts, processes, and flattens messages to a single string.
 *
 * @param {OpenAIClient} openai - The OpenAI client instance.
 * @param {ThreadMessage[]} messages - An array of messages.
 * @returns {Promise<{messages: ThreadMessage[], text: string}>} The sorted messages and the flattened text.
 */
async function processMessages(openai, messages = []) {
  const sorted = messages.sort((a, b) => a.created_at - b.created_at);
  const processedFileIds = new Set();

  let text = '';
  for (const message of sorted) {
    message.files = [];
    for (const content of message.content) {
      const processImageFile =
        content.type === 'image_file' && !processedFileIds.has(content.image_file?.file_id);
      if (processImageFile) {
        const fileId = content.image_file.file_id;

        const file = await retrieveAndProcessFile(openai, fileId, true);
        processedFileIds.add(fileId);
        message.files.push(file);
        continue;
      }

      text += (content.text?.value ?? '') + ' ';

      // Process annotations if they exist
      if (!content.text?.annotations) {
        continue;
      }

      for (const annotation of content.text.annotations) {
        let file;
        const processFilePath =
          annotation.file_path && !processedFileIds.has(annotation.file_path?.file_id);

        if (processFilePath) {
          const basename = imageRegex.test(annotation.text) ? path.basename(annotation.text) : null;
          file = await retrieveAndProcessFile(openai, annotation.file_path.file_id, basename);
          processedFileIds.add(annotation.file_path.file_id);
        }

        const processFileCitation =
          annotation.file_citation && !processedFileIds.has(annotation.file_citation?.file_id);

        if (processFileCitation) {
          file = await retrieveAndProcessFile(openai, annotation.file_citation.file_id, false);
          processedFileIds.add(annotation.file_citation.file_id);
        }

        if (!file && (annotation.file_path || annotation.file_citation)) {
          const { file_id } = annotation.file_citation || annotation.file_path || {};
          file = await retrieveAndProcessFile(openai, file_id, false);
          processedFileIds.add(file_id);
        }

        const { filepath } = file;
        text = text.replace(annotation.text, filepath);
        message.files.push(file);
      }
    }
  }

  return { messages: sorted, text };
}

module.exports = {
  initThread,
  createRun,
  waitForRun,
  getResponse,
  handleRun,
  sleep,
  mapMessagesToSteps,
  processMessages,
  createOnTextProgress,
};
