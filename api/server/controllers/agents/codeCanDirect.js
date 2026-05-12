const { logger } = require('@librechat/data-schemas');
const { v4: uuidv4 } = require('uuid');
const { sendEvent } = require('@librechat/api');
const { Constants, ContentTypes } = require('librechat-data-provider');
const OpenAIClient = require('~/app/clients/OpenAIClient');
const { saveMessage, saveConvo, getConvo, getMessages } = require('~/models');
const addTitle = require('~/server/services/Endpoints/openAI/title');
const { createOnProgress } = require('~/server/utils');
const {
  getJurisdiction,
  DEFAULT_JURISDICTION_ID,
  DEFAULT_MAX_NUM_RESULTS,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_VERBOSITY,
  NO_RELEVANT_TEXT,
} = require('~/server/services/prompts/codeCan');

function extractCompletionText(completion, fallback = '') {
  if (typeof completion === 'string') {
    return completion;
  }
  return completion?.text ?? fallback;
}

/**
 * CodeCan direct Responses API handler.
 *
 * Pipeline:
 *   1. Resolve the locked jurisdiction (conversation → request → user-default → fallback).
 *   2. Look up the prior assistant message's openai_response_id for `previous_response_id` threading.
 *   3. Make ONE streaming Responses API call against the jurisdiction's vector stores.
 *   4. Persist response.id on the assistant message for the next turn.
 *
 * The legacy two-stage pre-flight classifier (Ontario → fallback NBC) was removed; the same
 * "OBC first, NBC fallback" semantics are now expressed by the jurisdiction registry which lists
 * both vector stores on the Ontario entry and instructs the model to prefer OBC citations.
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

  const existingConvo = await getConvo(userId, convoId);
  const isNewConvo = existingConvo == null;
  const isRootMessage = (parentMessageId ?? Constants.NO_PARENT) === Constants.NO_PARENT;

  // Jurisdiction resolution: conversation lock wins. Once a conversation has a jurisdiction
  // set, switching is a "new chat" UX, never a silent corpus swap mid-thread.
  const requestedJurisdictionId =
    existingConvo?.jurisdiction ||
    endpointOption?.jurisdictionId ||
    req.body?.resolvedJurisdictionId ||
    req.body?.jurisdiction ||
    req.user?.personalization?.jurisdiction ||
    DEFAULT_JURISDICTION_ID;
  const jurisdiction = getJurisdiction(requestedJurisdictionId);

  req.traceStep?.('codecan_jurisdiction_resolved', {
    conversationId: convoId,
    jurisdictionId: jurisdiction.id,
    vectorStoreIds: jurisdiction.vectorStoreIds,
    locked: Boolean(existingConvo?.jurisdiction),
  });

  // Build base model options from endpointOption.
  const baseModelOptions = Object.assign(
    {},
    endpointOption?.model_parameters ?? endpointOption?.modelOptions ?? {},
  );
  baseModelOptions.useResponsesApi = true;

  const clientBaseOptions = {
    req,
    res,
    endpoint: endpointOption?.endpoint,
    endpointType: endpointOption?.endpointType,
    sender: endpointOption?.sender,
    resendFiles: endpointOption?.resendFiles ?? true,
    maxContextTokens: endpointOption?.maxContextTokens,
  };

  // Single-message payload. Multi-turn context is supplied to the model via
  // `previous_response_id` rather than re-sending prior turns as input messages.
  const payload = [{ role: 'user', content: text }];

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

  // Save user message so it appears in the timeline.
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
        // Lock jurisdiction on first save. saveConvo upserts via $set, so on subsequent turns
        // this is a no-op write of the already-locked value.
        jurisdiction: jurisdiction.id,
      },
      { context: 'api/server/controllers/agents/codeCanDirect.js - saveConvo (user)' },
    );
  } catch (error) {
    logger.error('[CodeCan] Failed to save conversation (user)', {
      conversationId: convoId,
      userId,
      error,
    });
  }

  // Look up the prior assistant message's openai_response_id for threading. On the first turn
  // of a conversation (or if no prior assistant message recorded an id) this stays null.
  let previousResponseId = null;
  if (!isRootMessage) {
    try {
      const priorMessages = await getMessages(
        {
          conversationId: convoId,
          isCreatedByUser: false,
          openai_response_id: { $ne: null },
        },
        'openai_response_id createdAt',
      );
      if (Array.isArray(priorMessages) && priorMessages.length) {
        // getMessages returns ascending by default; take the most recent.
        const latest = priorMessages[priorMessages.length - 1];
        previousResponseId = latest?.openai_response_id ?? null;
      }
    } catch (error) {
      logger.warn('[CodeCan] Failed to look up previous_response_id', {
        conversationId: convoId,
        error: error?.message,
      });
    }
  }
  req.traceStep?.('codecan_previous_response_id', {
    conversationId: convoId,
    previousResponseId,
    isFirstTurn: isRootMessage,
  });

  // First-turn forces retrieval; follow-ups let the model decide whether to re-search.
  // With `previous_response_id` the model already sees prior tool results in its context.
  const toolChoice = isRootMessage ? 'required' : 'auto';

  const stageModelOptions = Object.assign({}, baseModelOptions, {
    useResponsesApi: true,
    stream: true,
    instructions: jurisdiction.systemPrompt,
    promptPrefix: jurisdiction.systemPrompt,
    tools: [
      {
        type: 'file_search',
        vector_store_ids: jurisdiction.vectorStoreIds,
        max_num_results: DEFAULT_MAX_NUM_RESULTS,
      },
    ],
    tool_choice: toolChoice,
    tool_resources: {
      file_search: { vector_store_ids: jurisdiction.vectorStoreIds },
    },
    previous_response_id: previousResponseId,
    // gpt-5-mini reasoning controls — defaults are too high for retrieval-grounded Q&A.
    reasoning: { effort: DEFAULT_REASONING_EFFORT },
    text: { verbosity: DEFAULT_VERBOSITY },
  });

  const client = new OpenAIClient(endpointOption?.model_parameters?.apiKey, {
    ...clientBaseOptions,
    modelOptions: stageModelOptions,
  });

  req.traceStep?.('codecan_direct_llm_start');
  let completion;
  try {
    completion = await client.chatCompletion({
      payload,
      onProgress,
      abortController,
      returnRaw: true,
    });
  } catch (error) {
    // Stale/expired previous_response_id (OpenAI returns 400/404) → retry once without it.
    const message = error?.message || '';
    const looksLikeStaleResponseId =
      previousResponseId &&
      /previous_response_id|response_.*not.*found|invalid.*response/i.test(message);
    if (!looksLikeStaleResponseId) {
      throw error;
    }
    logger.warn('[CodeCan] previous_response_id rejected, retrying without it', {
      conversationId: convoId,
      previousResponseId,
      error: message,
    });
    req.traceStep?.('codecan_previous_response_id_retry');
    const retryModelOptions = Object.assign({}, stageModelOptions, {
      previous_response_id: null,
    });
    const retryClient = new OpenAIClient(endpointOption?.model_parameters?.apiKey, {
      ...clientBaseOptions,
      modelOptions: retryModelOptions,
    });
    completion = await retryClient.chatCompletion({
      payload,
      onProgress,
      abortController,
      returnRaw: true,
    });
  }
  req.traceStep?.('codecan_direct_llm_end');

  let finalText = extractCompletionText(completion, aggregated || '');
  // Normalize legacy sentinel strings to the unified one.
  if (
    finalText.trim() === 'No relevant content found in the Ontario Building Code vector store.' ||
    finalText.trim() === 'No relevant content found in the National Building Code vector store.'
  ) {
    finalText = NO_RELEVANT_TEXT;
  }
  const rawResponse = completion?.raw;
  const openaiResponseId = rawResponse?.id ?? null;

  // Extract annotations from raw response if present.
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
    citations: finalText === NO_RELEVANT_TEXT ? [] : citations,
    openai_response_id: openaiResponseId,
  };

  try {
    await saveMessage(req, responseMessage, {
      context: 'api/server/controllers/agents/codeCanDirect.js - response',
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
        jurisdiction: jurisdiction.id,
      },
      { context: 'api/server/controllers/agents/codeCanDirect.js - saveConvo (response)' },
    );
  } catch (error) {
    logger.error('[CodeCan] Failed to save conversation (response)', {
      conversationId: convoId,
      userId,
      error,
    });
  }

  sendEvent(res, {
    final: true,
    conversation: conversation || { conversationId: convoId, jurisdiction: jurisdiction.id },
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
