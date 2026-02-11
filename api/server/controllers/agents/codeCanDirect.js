const { logger } = require('@librechat/data-schemas');
const { v4: uuidv4 } = require('uuid');
const { sendEvent } = require('@librechat/api');
const { Constants, ContentTypes } = require('librechat-data-provider');
const OpenAIClient = require('~/app/clients/OpenAIClient');
const { saveMessage, saveConvo, getConvo } = require('~/models');
const addTitle = require('~/server/services/Endpoints/openAI/title');
const { createOnProgress } = require('~/server/utils');
const {
  buildCodeCanSystemPrompt,
  getCodeCanVectorStoreConfig,
  getCodeCanVectorStoreIds,
  NO_RELEVANT_ONTARIO_TEXT,
  NO_RELEVANT_NATIONAL_TEXT,
} = require('~/server/services/prompts/codeCan');

const PRE_FLIGHT_RESPONSE = Object.freeze({
  RELEVANT: 'RELEVANT',
  NOT_RELEVANT: 'NOT_RELEVANT',
});
const CODECAN_NO_RELEVANT_TEXT = 'No relevant content found in the Ontario or National Building Code files.';
const PRE_FLIGHT_INSTRUCTIONS = `Determine whether the Ontario Building Code retrieval can answer the user question.
Always call file_search before deciding.
Return exactly one token and nothing else:
- RELEVANT
- NOT_RELEVANT`;

function extractCompletionText(completion, fallback = '') {
  if (typeof completion === 'string') {
    return completion;
  }
  return completion?.text ?? fallback;
}

function isOntarioRelevant(preflightText) {
  const decision = String(preflightText || '').trim().toUpperCase();
  if (decision.includes(PRE_FLIGHT_RESPONSE.NOT_RELEVANT)) {
    return false;
  }
  return true;
}

function buildStageModelOptions(baseModelOptions, stage, stream, instructions = buildCodeCanSystemPrompt(stage)) {
  return Object.assign({}, baseModelOptions, {
    useResponsesApi: true,
    stream,
    instructions,
    promptPrefix: instructions,
    tools: [{ type: 'file_search' }],
    tool_choice: 'required',
    tool_resources: {
      file_search: {
        vector_store_ids: getCodeCanVectorStoreIds(stage),
      },
    },
  });
}

/**
 * CodeCan-only direct Responses API handler (bypasses LangGraph/agents).
 * Streams or returns the response using OpenAIClient.handleResponsesApi.
 */
async function codeCanDirectHandler(req, res) {
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

  req.traceStep?.('codecan_direct_start', {
    endpoint: endpointOption?.endpoint,
    conversationId: convoId,
  });

  // Build base model options from endpointOption
  const baseModelOptions = Object.assign(
    {},
    endpointOption?.model_parameters ?? endpointOption?.modelOptions ?? {},
  );
  baseModelOptions.useResponsesApi = true;
  const vectorStoreConfig = getCodeCanVectorStoreConfig();

  const clientBaseOptions = {
    req,
    res,
    endpoint: endpointOption?.endpoint,
    endpointType: endpointOption?.endpointType,
    sender: endpointOption?.sender,
    resendFiles: endpointOption?.resendFiles ?? true,
    maxContextTokens: endpointOption?.maxContextTokens,
  };
  let client = null;

  const existingConvo = await getConvo(userId, convoId);
  const isNewConvo = existingConvo == null;
  const isRootMessage = (parentMessageId ?? Constants.NO_PARENT) === Constants.NO_PARENT;

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
  const onProgress = (delta) => {
    aggregated += delta;
    if (!sentFirstToken) {
      sentFirstToken = true;
      req.traceStep?.('codecan_direct_first_token');
    }
    sendProgress(delta);
  };

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
  try {
    logger.info('[CodeCan] Saving user message', {
      conversationId: convoId,
      messageId: userMessageId,
      userId,
    });
    await saveMessage(req, userMessage, {
      context: 'api/server/controllers/agents/codeCanDirect.js - user message',
    });
    logger.info('[CodeCan] Saved user message', {
      conversationId: convoId,
      messageId: userMessageId,
      userId,
    });
    sendEvent(res, { message: userMessage, created: true });
  } catch (error) {
    logger.error('[CodeCan] Failed to save user message', {
      conversationId: convoId,
      messageId: userMessageId,
      userId,
      error,
    });
    throw error;
  }
  req.traceStep?.('codecan_direct_user_saved');
  let conversation = null;
  try {
    conversation = await saveConvo(
      req,
      {
        conversationId: convoId,
        endpoint: endpointOption?.endpoint,
        endpointType: endpointOption?.endpointType,
      },
      { context: 'api/server/controllers/agents/codeCanDirect.js - saveConvo (user)' },
    );
    logger.info('[CodeCan] Saved conversation (user)', {
      conversationId: convoId,
      userId,
    });
  } catch (error) {
    logger.error('[CodeCan] Failed to save conversation (user)', {
      conversationId: convoId,
      userId,
      error,
    });
  }

  req.traceStep?.('codecan_preflight_start', {
    conversationId: convoId,
    vectorStoreId: vectorStoreConfig.ontarioId,
  });
  const preflightModelOptions = buildStageModelOptions(
    baseModelOptions,
    'ontario',
    false,
    PRE_FLIGHT_INSTRUCTIONS,
  );
  const preflightClient = new OpenAIClient(endpointOption?.model_parameters?.apiKey, {
    ...clientBaseOptions,
    modelOptions: preflightModelOptions,
  });
  const preflightCompletion = await preflightClient.chatCompletion({
    payload,
    abortController,
    returnRaw: false,
  });
  const preflightText = extractCompletionText(preflightCompletion).trim();
  const selectedStage = isOntarioRelevant(preflightText) ? 'ontario' : 'national';
  req.traceStep?.('codecan_preflight_result', {
    conversationId: convoId,
    response: preflightText,
    selectedStage,
  });
  req.traceStep?.('codecan_selected_stage', {
    conversationId: convoId,
    stage: selectedStage,
  });
  req.traceStep?.('codecan_selected_vector_store_id', {
    conversationId: convoId,
    vectorStoreId:
      selectedStage === 'ontario' ? vectorStoreConfig.ontarioId : vectorStoreConfig.nationalId,
  });

  const stageModelOptions = buildStageModelOptions(baseModelOptions, selectedStage, true);
  client = new OpenAIClient(endpointOption?.model_parameters?.apiKey, {
    ...clientBaseOptions,
    modelOptions: stageModelOptions,
  });

  // Run completion
  req.traceStep?.('codecan_direct_llm_start');
  const completion = await client.chatCompletion({
    payload,
    onProgress,
    abortController,
    returnRaw: true,
  });
  req.traceStep?.('codecan_direct_llm_end');

  let finalText = extractCompletionText(completion, aggregated || '');
  if (selectedStage === 'national' && finalText.trim() === NO_RELEVANT_NATIONAL_TEXT) {
    finalText = CODECAN_NO_RELEVANT_TEXT;
  } else if (selectedStage === 'ontario' && finalText.trim() === NO_RELEVANT_ONTARIO_TEXT) {
    finalText = CODECAN_NO_RELEVANT_TEXT;
  }
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
    citations:
      finalText === CODECAN_NO_RELEVANT_TEXT || finalText.trim() === NO_RELEVANT_NATIONAL_TEXT
        ? []
        : citations,
  };

  // Save response message
  try {
    logger.info('[CodeCan] Saving response message', {
      conversationId: convoId,
      messageId: responseMessageId,
      userId,
    });
    await saveMessage(req, responseMessage, {
      context: 'api/server/controllers/agents/codeCanDirect.js - response',
    });
    logger.info('[CodeCan] Saved response message', {
      conversationId: convoId,
      messageId: responseMessageId,
      userId,
    });
  } catch (error) {
    logger.error('[CodeCan] Failed to save response message', {
      conversationId: convoId,
      messageId: responseMessageId,
      userId,
      error,
    });
    throw error;
  }
  req.traceStep?.('codecan_direct_response_saved');
  try {
    conversation = await saveConvo(
      req,
      {
        conversationId: convoId,
        endpoint: endpointOption?.endpoint,
        endpointType: endpointOption?.endpointType,
      },
      { context: 'api/server/controllers/agents/codeCanDirect.js - saveConvo (response)' },
    );
    logger.info('[CodeCan] Saved conversation (response)', {
      conversationId: convoId,
      userId,
    });
  } catch (error) {
    logger.error('[CodeCan] Failed to save conversation (response)', {
      conversationId: convoId,
      userId,
      error,
    });
  }

  // Emit final event
  sendEvent(res, {
    final: true,
    conversation: conversation || { conversationId: convoId },
    title: conversation?.title ?? null,
    requestMessage: userMessage,
    responseMessage,
  });
  res.end();

  if (addTitle && isNewConvo && isRootMessage) {
    addTitle(req, {
      text,
      response: responseMessage,
      client,
    })
      .then(() => {
        logger.debug('[CodeCan] Title generation started');
      })
      .catch((err) => {
        logger.error('[CodeCan] Error in title generation', err);
      })
      .finally(() => {
        logger.debug('[CodeCan] Title generation completed');
      });
  }
}

module.exports = { codeCanDirectHandler };
