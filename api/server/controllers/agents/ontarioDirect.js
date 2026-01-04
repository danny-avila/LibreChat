const { logger } = require('@librechat/data-schemas');
const { v4: uuidv4 } = require('uuid');
const { sendEvent } = require('@librechat/api');
const { Constants, ContentTypes } = require('librechat-data-provider');
const OpenAIClient = require('~/app/clients/OpenAIClient');
const { saveMessage } = require('~/models');
const { createOnProgress } = require('~/server/utils');

/**
 * Ontario-only direct Responses API handler (bypasses LangGraph/agents).
 * Streams or returns the response using OpenAIClient.handleResponsesApi.
 */
async function ontarioDirectHandler(req, res) {
  const {
    endpointOption,
    text,
    conversationId,
    parentMessageId = null,
    messageId: clientMessageId,
    responseMessageId: clientResponseMessageId,
  } = req.body;
  const userId = req.user.id;
  const convoId = conversationId ?? uuidv4();

  req.traceStep?.('ontario_direct_start', {
    endpoint: endpointOption?.endpoint,
    conversationId: convoId,
  });

  // Build model options from endpointOption
  const modelOptions = Object.assign(
    {},
    endpointOption?.model_parameters ?? endpointOption?.modelOptions ?? {},
  );
  // Force Responses API path; ensure stream flag matches client expectations
  modelOptions.useResponsesApi = true;
  // Stream tokens for faster perceived latency; capture final response for annotations
  modelOptions.stream = true;

  const clientOptions = {
    req,
    res,
    endpoint: endpointOption?.endpoint,
    endpointType: endpointOption?.endpointType,
    modelOptions,
    sender: endpointOption?.sender,
    resendFiles: endpointOption?.resendFiles ?? true,
    maxContextTokens: endpointOption?.maxContextTokens,
  };

  const client = new OpenAIClient(endpointOption?.model_parameters?.apiKey, clientOptions);

  // Prepare message payload for OpenAIClient
  const payload = [
    {
      role: 'user',
      content: text,
    },
  ];

  const abortController = new AbortController();

  let aggregated = '';
  let sentFirstToken = false;
  const { onProgress: progressCallback } = createOnProgress();
  const responseMessageId =
    clientResponseMessageId ?? (clientMessageId ? `${clientMessageId}_` : uuidv4());
  const sendProgress = progressCallback({
    res,
    index: 0,
    messageId: responseMessageId,
    conversationId: convoId,
    type: ContentTypes.TEXT,
    thread_id: null,
  });
  const onProgress =
    modelOptions.stream === true
      ? (delta) => {
          aggregated += delta;
          if (!sentFirstToken) {
            sentFirstToken = true;
            req.traceStep?.('ontario_direct_first_token');
          }
          sendProgress(delta);
        }
      : undefined;

  // Prepare user message and save it so it appears in the timeline
  const userMessageId = clientMessageId ?? uuidv4();
  const userMessage = {
    messageId: userMessageId,
    user: userId,
    text,
    role: 'user',
    isCreatedByUser: true,
    endpoint: endpointOption?.endpoint,
    conversationId: convoId,
    parentMessageId: parentMessageId ?? Constants.NO_PARENT,
  };
  await saveMessage(req, userMessage, {
    context: 'api/server/controllers/agents/ontarioDirect.js - user message',
  });
  req.traceStep?.('ontario_direct_user_saved');

  // Run completion
  req.traceStep?.('ontario_direct_llm_start');
  const completion = await client.chatCompletion({
    payload,
    onProgress,
    abortController,
    returnRaw: true,
  });
  req.traceStep?.('ontario_direct_llm_end');

  const finalText =
    typeof completion === 'string'
      ? completion
      : (completion && completion.text) || aggregated || '';
  const rawResponse = completion?.raw;
  // Extract annotations from raw response if present
  let annotations = [];
  try {
    const messageOutput = Array.isArray(rawResponse?.output)
      ? rawResponse.output.find((item) => item?.type === 'message')
      : null;
    const contents = Array.isArray(messageOutput?.content) ? messageOutput.content : [];
    const outputText = contents.find((c) => c?.type === 'output_text');
    if (outputText?.annotations) {
      annotations = outputText.annotations;
    }
  } catch (e) {
    /* ignore annotation extraction errors */
  }

  // Build response message
  const citations =
    Array.isArray(annotations) && annotations.length
      ? annotations
          .filter((a) => a.type === 'file_citation')
          .map((a) => {
            const filename = a.filename || '';
            const pageMatch = filename.match(/page_(\d+)/i);
            const page = pageMatch ? Number(pageMatch[1]) : undefined;
            return {
              id: a.file_id || filename || uuidv4(),
              url: filename || a.file_id || '',
              page,
            };
          })
      : undefined;

  const responseMessage = {
    messageId: responseMessageId,
    user: userId,
    text: finalText,
    role: 'assistant',
    endpoint: endpointOption?.endpoint,
    conversationId: convoId,
    parentMessageId: userMessageId,
    annotations,
    citations,
  };

  // Save response message
  await saveMessage(req, responseMessage, {
    context: 'api/server/controllers/agents/ontarioDirect.js - response',
  });
  req.traceStep?.('ontario_direct_response_saved');

  // Emit final event
  sendEvent(res, {
    final: true,
    conversation: {
      conversationId: convoId,
    },
    title: null,
    requestMessage: userMessage,
    responseMessage,
  });
  res.end();
}

module.exports = { ontarioDirectHandler };
