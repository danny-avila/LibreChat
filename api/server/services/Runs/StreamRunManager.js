const {
  AssistantStreamEvents,
  StepTypes,
  ContentTypes,
  MessageContentTypes,
} = require('librechat-data-provider');
const { createOnProgress, sendMessage } = require('~/server/utils');
const { processMessages } = require('~/server/services/Threads');
const { logger } = require('~/config');

class StreamRunManager {
  constructor(fields) {
    this.index = 0;
    this.steps = new Map();
    this.mappedOrder = new Map();
    this.processedFileIds = new Set();
    this.progressCallbacks = new Map();
    this.run = null;

    this.req = fields.req;
    this.res = fields.res;
    this.openai = fields.openai;
    this.thread_id = fields.thread_id;
    this.clientHandlers = fields.handlers ?? {};
    this.finalMessage = fields.responseMessage ?? {};
    this.text = '';

    this.handlers = {
      [AssistantStreamEvents.ThreadCreated]: this.handleThreadCreated,
      [AssistantStreamEvents.ThreadRunCreated]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunQueued]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunInProgress]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunRequiresAction]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunCompleted]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunFailed]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunCancelling]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunCancelled]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunExpired]: this.handleRunEvent,
      [AssistantStreamEvents.ThreadRunStepCreated]: this.handleRunStepEvent,
      [AssistantStreamEvents.ThreadRunStepInProgress]: this.handleRunStepEvent,
      [AssistantStreamEvents.ThreadRunStepCompleted]: this.handleRunStepEvent,
      [AssistantStreamEvents.ThreadRunStepFailed]: this.handleRunStepEvent,
      [AssistantStreamEvents.ThreadRunStepCancelled]: this.handleRunStepEvent,
      [AssistantStreamEvents.ThreadRunStepExpired]: this.handleRunStepEvent,
      [AssistantStreamEvents.ThreadRunStepDelta]: this.handleRunStepDeltaEvent,
      [AssistantStreamEvents.ThreadMessageCreated]: this.handleMessageEvent,
      [AssistantStreamEvents.ThreadMessageInProgress]: this.handleMessageEvent,
      [AssistantStreamEvents.ThreadMessageCompleted]: this.handleMessageEvent,
      [AssistantStreamEvents.ThreadMessageIncomplete]: this.handleMessageEvent,
      [AssistantStreamEvents.ThreadMessageDelta]: this.handleMessageDeltaEvent,
      [AssistantStreamEvents.ErrorEvent]: this.handleErrorEvent,
    };
  }

  async addContentData(data) {
    const { type, index } = data;
    this.finalMessage.content[index] = { type, [type]: data[type] };

    if (type === ContentTypes.TEXT) {
      this.text += data[type].value;
      return;
    }

    const contentData = {
      index,
      type,
      [type]: data[type],
      thread_id: this.thread_id,
      messageId: this.finalMessage.messageId,
      conversationId: this.finalMessage.conversationId,
    };

    logger.debug('Content data:', contentData);
    sendMessage(this.res, contentData);
  }

  async handleEvent(event) {
    logger.debug(event.event);
    const handler = this.handlers[event.event];
    const clientHandler = this.clientHandlers[event.event];

    if (clientHandler) {
      await clientHandler.call(this, event);
    }

    if (handler) {
      await handler.call(this, event);
    } else {
      logger.warn(`Unhandled event type: ${event.event}`);
    }
  }

  /**
   * Handle thread.created event
   * @param {ThreadCreated} event -
   * The thread.created event object.
   */
  async handleThreadCreated(event) {
    logger.debug('Thread created:', event.data);
  }

  /**
   * Handle Run Events
   * @param {ThreadRunCreated | ThreadRunQueued | ThreadRunInProgress | ThreadRunRequiresAction | ThreadRunCompleted | ThreadRunFailed | ThreadRunCancelling | ThreadRunCancelled | ThreadRunExpired} event -
   * The run event object.
   */
  async handleRunEvent(event) {
    this.run = event.data;
    logger.debug('Run event:', this.run);
  }

  /**
   * Handle Run Step Events
   * @param {ThreadRunStepCreated | ThreadRunStepInProgress | ThreadRunStepCompleted | ThreadRunStepFailed | ThreadRunStepCancelled | ThreadRunStepExpired} event -
   * The run step event object.
   */
  async handleRunStepEvent(event) {
    logger.debug('Run step event:', event.data);

    const step = event.data;
    this.steps.set(step.id, step);

    if (event.event === AssistantStreamEvents.ThreadRunStepCreated) {
      this.runStepCreated(event);
    }
  }

  /**
   * Handle Run Step Delta Event
   * @param {ThreadRunStepDelta} event -
   * The run step delta event object.
   */
  async handleRunStepDeltaEvent(event) {
    logger.debug('Run step delta event:', event.data);
  }

  /**
   * Handle Message Event
   * @param {ThreadMessageCreated | ThreadMessageInProgress | ThreadMessageCompleted | ThreadMessageIncomplete} event -
   * The Message event object.
   */
  async handleMessageEvent(event) {
    logger.debug('Message event:', event.data);
    if (event.event === AssistantStreamEvents.ThreadMessageCompleted) {
      this.messageCompleted(event);
    }
  }

  /**
   * Handle Message Delta Event
   * @param {ThreadMessageDelta} event -
   * The Message Delta event object.
   */
  async handleMessageDeltaEvent(event) {
    const message = event.data;
    logger.debug('Message delta event:', message);
    const onProgress = this.progressCallbacks.get(message.id);
    const content = message.delta.content?.[0];

    if (content && content.type === MessageContentTypes.TEXT) {
      onProgress(content.text.value);
    }
  }

  /**
   * Handle Error Event
   * @param {ErrorEvent} event -
   * The Error event object.
   */
  async handleErrorEvent(event) {
    logger.error('Error event:', event.data);
  }

  /* <------------------ RunStep Event handlers ------------------> */

  /**
   * Handle Run Step Created Events
   * @param {ThreadRunStepCreated} event -
   * The created run step event object.
   */
  async runStepCreated(event) {
    const step = event.data;
    const isMessage = step.type === StepTypes.MESSAGE_CREATION;
    const stepKey = isMessage
      ? // `message_id` is used since message delta events don't reference the step.id
      step.step_details.message_creation.message_id
      : step.id;

    let index = this.mappedOrder.get(stepKey);
    if (index === undefined) {
      index = this.index;
      this.mappedOrder.set(stepKey, this.index);
      this.index++;
    }

    // Create the Factory Function to stream the message
    const { onProgress: progressCallback } = createOnProgress({
      // todo: add option to save partialText to db
      // onProgress: () => {},
    });

    if (isMessage) {
      // This creates a function that attaches all of the parameters
      // specified here to each SSE message generated by the TextStream
      const onProgress = progressCallback({
        index,
        res: this.res,
        messageId: this.finalMessage.messageId,
        conversationId: this.finalMessage.conversationId,
        thread_id: this.thread_id,
        type: ContentTypes.TEXT,
      });

      this.progressCallbacks.set(stepKey, onProgress);
    } else {
      // WIP: handle tool_calls step types
    }
  }

  /* <------------------ Message Event handlers ------------------> */

  /**
   * Handle Message Completed Events
   * @param {ThreadMessageCompleted} event -
   * The Completed Message event object.
   */
  async messageCompleted(event) {
    const message = event.data;
    const result = await processMessages({
      openai: this.openai,
      client: this,
      messages: [message],
    });
    const index = this.mappedOrder.get(message.id);
    this.addContentData({
      [ContentTypes.TEXT]: { value: result.text },
      type: ContentTypes.TEXT,
      index,
    });
  }
}

module.exports = StreamRunManager;
