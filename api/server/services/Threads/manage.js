const { v4 } = require('uuid');
const {
  EModelEndpoint,
  Constants,
  defaultOrderQuery,
  ContentTypes,
} = require('librechat-data-provider');
const { recordMessage, getMessages } = require('~/models/Message');
const { saveConvo } = require('~/models/Conversation');
const spendTokens = require('~/models/spendTokens');
const { countTokens } = require('~/server/utils');

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
 * Saves a user message to the DB in the Assistants endpoint format.
 *
 * @param {Object} params - The parameters of the user message
 * @param {string} params.user - The user's ID.
 * @param {string} params.text - The user's prompt.
 * @param {string} params.messageId - The user message Id.
 * @param {string} params.model - The model used by the assistant.
 * @param {string} params.assistant_id - The current assistant Id.
 * @param {string} params.thread_id - The thread Id.
 * @param {string} params.conversationId - The message's conversationId
 * @param {string} [params.parentMessageId] - Optional if initial message.
 * Defaults to Constants.NO_PARENT.
 * @param {string} [params.instructions] - Optional: from preset for `instructions` field.
 * Overrides the instructions of the assistant.
 * @param {string} [params.promptPrefix] - Optional: from preset for `additional_instructions` field.
 * @param {import('librechat-data-provider').TFile[]} [params.files] - Optional. List of Attached File Objects.
 * @param {string[]} [params.file_ids] - Optional. List of File IDs attached to the userMessage.
 * @return {Promise<Run>} A promise that resolves to the created run object.
 */
async function saveUserMessage(params) {
  const tokenCount = await countTokens(params.text);

  // todo: do this on the frontend
  // const { file_ids = [] } = params;
  // let content;
  // if (file_ids.length) {
  //   content = [
  //     {
  //       value: params.text,
  //     },
  //     ...(
  //       file_ids
  //         .filter(f => f)
  //         .map((file_id) => ({
  //           file_id,
  //         }))
  //     ),
  //   ];
  // }

  const userMessage = {
    user: params.user,
    endpoint: EModelEndpoint.assistants,
    messageId: params.messageId,
    conversationId: params.conversationId,
    parentMessageId: params.parentMessageId ?? Constants.NO_PARENT,
    /* For messages, use the assistant_id instead of model */
    model: params.assistant_id,
    thread_id: params.thread_id,
    sender: 'User',
    text: params.text,
    isCreatedByUser: true,
    tokenCount,
  };

  const convo = {
    endpoint: EModelEndpoint.assistants,
    conversationId: params.conversationId,
    promptPrefix: params.promptPrefix,
    instructions: params.instructions,
    assistant_id: params.assistant_id,
    model: params.model,
  };

  if (params.files?.length) {
    userMessage.files = params.files.map(({ file_id }) => ({ file_id }));
    convo.file_ids = params.file_ids;
  }

  const message = await recordMessage(userMessage);
  await saveConvo(params.user, convo);

  return message;
}

/**
 * Saves an Assistant message to the DB in the Assistants endpoint format.
 *
 * @param {Object} params - The parameters of the Assistant message
 * @param {string} params.user - The user's ID.
 * @param {string} params.messageId - The message Id.
 * @param {string} params.assistant_id - The assistant Id.
 * @param {string} params.thread_id - The thread Id.
 * @param {string} params.model - The model used by the assistant.
 * @param {ContentPart[]} params.content - The message content parts.
 * @param {string} params.conversationId - The message's conversationId
 * @param {string} params.parentMessageId - The latest user message that triggered this response.
 * @param {string} [params.instructions] - Optional: from preset for `instructions` field.
 * Overrides the instructions of the assistant.
 * @param {string} [params.promptPrefix] - Optional: from preset for `additional_instructions` field.
 * @return {Promise<Run>} A promise that resolves to the created run object.
 */
async function saveAssistantMessage(params) {
  const text = params.content.reduce((acc, part) => {
    if (!part.value) {
      return acc;
    }

    return acc + ' ' + part.value;
  }, '');

  // const tokenCount = // TODO: need to count each content part

  const message = await recordMessage({
    user: params.user,
    endpoint: EModelEndpoint.assistants,
    messageId: params.messageId,
    conversationId: params.conversationId,
    parentMessageId: params.parentMessageId,
    thread_id: params.thread_id,
    /* For messages, use the assistant_id instead of model */
    model: params.assistant_id,
    content: params.content,
    sender: 'Assistant',
    isCreatedByUser: false,
    text: text.trim(),
    // tokenCount,
  });

  await saveConvo(params.user, {
    endpoint: EModelEndpoint.assistants,
    conversationId: params.conversationId,
    promptPrefix: params.promptPrefix,
    instructions: params.instructions,
    assistant_id: params.assistant_id,
    model: params.model,
  });

  return message;
}

/**
 * Records LibreChat messageId to all response messages' metadata
 *
 * @param {Object} params - The parameters for initializing a thread.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {string} params.thread_id - Response thread ID.
 * @param {string} params.messageId - The response `messageId` generated by LibreChat.
 * @param {StepMessage[] | Message[]} params.messages - A list of messages to start the thread with.
 * @return {Promise<ThreadMessage[]>} A promise that resolves to the updated messages
 */
async function addThreadMetadata({ openai, thread_id, messageId, messages }) {
  const promises = [];
  for (const message of messages) {
    promises.push(
      openai.beta.threads.messages.update(thread_id, message.id, {
        metadata: {
          messageId,
        },
      }),
    );
  }

  return await Promise.all(promises);
}

/**
 * Synchronizes LibreChat messages to Thread Messages.
 * Updates the LibreChat DB with any missing Thread Messages and
 * updates the missing Thread Messages' metadata with their corresponding db messageId's.
 *
 * Also updates the existing conversation's file_ids with any new file_ids.
 *
 * @param {Object} params - The parameters for synchronizing messages.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {TMessage[]} params.dbMessages - The LibreChat DB messages.
 * @param {ThreadMessage[]} params.apiMessages - The thread messages from the API.
 * @param {string} params.conversationId - The current conversation ID.
 * @param {string} params.thread_id - The current thread ID.
 * @param {string} [params.assistant_id] - The current assistant ID.
 * @return {Promise<TMessage[]>} A promise that resolves to the updated messages
 */
async function syncMessages({
  openai,
  apiMessages,
  dbMessages,
  conversationId,
  thread_id,
  assistant_id,
}) {
  let result = [];
  let dbMessageMap = new Map(dbMessages.map((msg) => [msg.messageId, msg]));

  const modifyPromises = [];
  const recordPromises = [];

  /**
   *
   * Modify API message and save newMessage to DB
   *
   * @param {Object} params - The parameters object
   * @param {TMessage} params.dbMessage
   * @param {dbMessage} params.apiMessage
   */
  const processNewMessage = async ({ dbMessage, apiMessage }) => {
    recordPromises.push(recordMessage({ ...dbMessage, user: openai.req.user.id }));

    if (!apiMessage.id.includes('msg_')) {
      return;
    }

    if (dbMessage.aggregateMessages?.length > 1) {
      modifyPromises.push(
        addThreadMetadata({
          openai,
          thread_id,
          messageId: dbMessage.messageId,
          messages: dbMessage.aggregateMessages,
        }),
      );
      return;
    }

    modifyPromises.push(
      openai.beta.threads.messages.update(thread_id, apiMessage.id, {
        metadata: {
          messageId: dbMessage.messageId,
        },
      }),
    );
  };

  let lastMessage = null;

  for (let i = 0; i < apiMessages.length; i++) {
    const apiMessage = apiMessages[i];

    // Check if the message exists in the database based on metadata
    const dbMessageId = apiMessage.metadata && apiMessage.metadata.messageId;
    let dbMessage = dbMessageMap.get(dbMessageId);

    if (dbMessage) {
      // If message exists in DB, use its messageId and update parentMessageId
      dbMessage.parentMessageId = lastMessage ? lastMessage.messageId : Constants.NO_PARENT;
      lastMessage = dbMessage;
      result.push(dbMessage);
      continue;
    }

    if (apiMessage.role === 'assistant' && lastMessage && lastMessage.role === 'assistant') {
      // Aggregate assistant messages
      lastMessage.content = [...lastMessage.content, ...apiMessage.content];
      lastMessage.files = [...(lastMessage.files ?? []), ...(apiMessage.files ?? [])];
      lastMessage.aggregateMessages.push({ id: apiMessage.id });
    } else {
      // Handle new or missing message
      const newMessage = {
        thread_id,
        conversationId,
        messageId: v4(),
        endpoint: EModelEndpoint.assistants,
        parentMessageId: lastMessage ? lastMessage.messageId : Constants.NO_PARENT,
        role: apiMessage.role,
        isCreatedByUser: apiMessage.role === 'user',
        // TODO: process generated files in content parts
        content: apiMessage.content,
        aggregateMessages: [{ id: apiMessage.id }],
        model: apiMessage.role === 'user' ? null : apiMessage.assistant_id,
        user: openai.req.user.id,
      };

      if (apiMessage.file_ids?.length) {
        // TODO: retrieve file objects from API
        newMessage.files = apiMessage.file_ids.map((file_id) => ({ file_id }));
      }

      /* Assign assistant_id if defined */
      if (assistant_id && apiMessage.role === 'assistant' && !newMessage.model) {
        apiMessage.model = assistant_id;
        newMessage.model = assistant_id;
      }

      result.push(newMessage);
      lastMessage = newMessage;

      if (apiMessage.role === 'user') {
        processNewMessage({ dbMessage: newMessage, apiMessage });
        continue;
      }
    }

    const nextMessage = apiMessages[i + 1];
    const processAssistant = !nextMessage || nextMessage.role === 'user';

    if (apiMessage.role === 'assistant' && processAssistant) {
      processNewMessage({ dbMessage: lastMessage, apiMessage });
    }
  }

  const attached_file_ids = apiMessages.reduce((acc, msg) => {
    if (msg.role === 'user' && msg.file_ids?.length) {
      return [...acc, ...msg.file_ids];
    }

    return acc;
  }, []);

  await Promise.all(modifyPromises);
  await Promise.all(recordPromises);

  await saveConvo(openai.req.user.id, {
    conversationId,
    file_ids: attached_file_ids,
  });

  return result;
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
  return steps
    .sort((a, b) => a.created_at - b.created_at)
    .map((step) => {
      const messageId = step.step_details?.message_creation?.message_id;

      if (messageId && messageMap[messageId]) {
        return { step, message: messageMap[messageId] };
      }
      return step;
    });
}

/**
 * Checks for any missing messages; if missing,
 * synchronizes LibreChat messages to Thread Messages
 *
 * @param {Object} params - The parameters for initializing a thread.
 * @param {OpenAIClient} params.openai - The OpenAI client instance.
 * @param {string} [params.latestMessageId] - Optional: The latest message ID from LibreChat.
 * @param {string} params.thread_id - Response thread ID.
 * @param {string} params.run_id - Response Run ID.
 * @param {string} params.conversationId - LibreChat conversation ID.
 * @return {Promise<TMessage[]>} A promise that resolves to the updated messages
 */
async function checkMessageGaps({ openai, latestMessageId, thread_id, run_id, conversationId }) {
  const promises = [];
  promises.push(openai.beta.threads.messages.list(thread_id, defaultOrderQuery));
  promises.push(openai.beta.threads.runs.steps.list(thread_id, run_id));
  /** @type {[{ data: ThreadMessage[] }, { data: RunStep[] }]} */
  const [response, stepsResponse] = await Promise.all(promises);

  const steps = mapMessagesToSteps(stepsResponse.data, response.data);
  /** @type {ThreadMessage} */
  const currentMessage = {
    id: v4(),
    content: [],
    assistant_id: null,
    created_at: Math.floor(new Date().getTime() / 1000),
    object: 'thread.message',
    role: 'assistant',
    run_id,
    thread_id,
    metadata: {
      messageId: latestMessageId,
    },
  };

  for (const step of steps) {
    if (!currentMessage.assistant_id && step.assistant_id) {
      currentMessage.assistant_id = step.assistant_id;
    }
    if (step.message) {
      currentMessage.id = step.message.id;
      currentMessage.created_at = step.message.created_at;
      currentMessage.content = currentMessage.content.concat(step.message.content);
    } else if (step.step_details?.type === 'tool_calls' && step.step_details?.tool_calls?.length) {
      currentMessage.content = currentMessage.content.concat(
        step.step_details?.tool_calls.map((toolCall) => ({
          [ContentTypes.TOOL_CALL]: {
            ...toolCall,
            progress: 2,
          },
          type: ContentTypes.TOOL_CALL,
        })),
      );
    }
  }

  let addedCurrentMessage = false;
  const apiMessages = response.data.map((msg) => {
    if (msg.id === currentMessage.id) {
      addedCurrentMessage = true;
      return currentMessage;
    }
    return msg;
  });

  if (!addedCurrentMessage) {
    apiMessages.push(currentMessage);
  }

  const dbMessages = await getMessages({ conversationId });
  const assistant_id = dbMessages?.[0]?.model;

  const syncedMessages = await syncMessages({
    openai,
    dbMessages,
    apiMessages,
    thread_id,
    conversationId,
    assistant_id,
  });

  return Object.values(
    [...dbMessages, ...syncedMessages].reduce(
      (acc, message) => ({ ...acc, [message.messageId]: message }),
      {},
    ),
  );
}

/**
 * Records token usage for a given completion request.
 *
 * @param {Object} params - The parameters for initializing a thread.
 * @param {number} params.prompt_tokens - The number of prompt tokens used.
 * @param {number} params.completion_tokens - The number of completion tokens used.
 * @param {string} params.model - The model used by the assistant run.
 * @param {string} params.user - The user's ID.
 * @param {string} params.conversationId - LibreChat conversation ID.
 * @return {Promise<TMessage[]>} A promise that resolves to the updated messages
 */
const recordUsage = async ({ prompt_tokens, completion_tokens, model, user, conversationId }) => {
  await spendTokens(
    {
      user,
      model,
      context: 'message',
      conversationId,
    },
    { promptTokens: prompt_tokens, completionTokens: completion_tokens },
  );
};

module.exports = {
  initThread,
  recordUsage,
  saveUserMessage,
  checkMessageGaps,
  addThreadMetadata,
  mapMessagesToSteps,
  saveAssistantMessage,
};
