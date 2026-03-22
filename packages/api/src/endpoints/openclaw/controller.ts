import { randomUUID } from 'node:crypto';
import { logger } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';
import { GenerationJobManager } from '~/stream';
import { gatewayManager } from './gateway';
import { createTranslationContext, translateEvent } from './events';
import type { ServerRequest } from '~/types';

interface OpenClawChatParams {
  req: ServerRequest;
  conversationId: string;
  /** Raw user text */
  text: string;
  /** Session key from the conversation doc (null = new session) */
  existingSessionKey: string | null;
  gatewayUrl: string;
  apiKey: string;
  model?: string;
  thinkLevel?: string;
  /** Called with the session key so the route can persist it */
  onSessionKey: (sessionKey: string) => Promise<void>;
}

/**
 * Core OpenClaw chat execution.
 * Connects to the gateway, streams events, and emits them via GenerationJobManager.
 * Returns immediately — streaming continues in the background.
 */
export async function runOpenClawChat(params: OpenClawChatParams): Promise<void> {
  const {
    req,
    conversationId,
    text,
    existingSessionKey,
    gatewayUrl,
    apiKey,
    model,
    thinkLevel,
    onSessionKey,
  } = params;

  const userId = req.user?.id ?? '';
  const streamId = conversationId;
  const messageId = randomUUID();

  const job = await GenerationJobManager.createJob(streamId, userId, conversationId);
  logger.debug('[OpenClawController] Job created', { streamId, conversationId, userId });

  // Emit job started response immediately so the frontend can subscribe to SSE
  // The HTTP response is handled by the route — this function only handles the job.

  // Run the streaming in a detached async task
  (async () => {
    const ctx = createTranslationContext(messageId, conversationId);

    let client;
    try {
      client = await gatewayManager.getClient(gatewayUrl, apiKey);
    } catch (err) {
      logger.error('[OpenClawController] Failed to connect to gateway', err);
      await GenerationJobManager.emitChunk(streamId, {
        final: true,
        error: true,
        errorMessage: 'OpenClaw gateway unavailable',
      } as never);
      return;
    }

    // Resolve or create the session key
    const sessionKey = existingSessionKey ?? `lc_${randomUUID()}`;
    if (!existingSessionKey) {
      await onSessionKey(sessionKey);
      logger.debug('[OpenClawController] Created new session', { sessionKey, conversationId });
    }

    // Store message metadata so reconnecting clients can resume
    await GenerationJobManager.updateMetadata(streamId, {
      responseMessageId: messageId,
      conversationId,
      userMessage: { messageId: randomUUID(), text, conversationId },
    });

    let lastRunId = '';

    try {
      for await (const chatEvent of client.chatSend({
        sessionKey,
        message: text,
        ...(thinkLevel ? { thinkLevel } : {}),
        ...(model ? { model } : {}),
      })) {
        lastRunId = chatEvent.runId || lastRunId;

        const sseEvents = translateEvent(chatEvent, ctx);
        for (const sseEvent of sseEvents) {
          await GenerationJobManager.emitChunk(streamId, sseEvent as never);
        }

        // Check if the job has been externally aborted
        const currentJob = await GenerationJobManager.getJob(streamId);
        if (!currentJob || currentJob.status === 'aborted') {
          logger.debug('[OpenClawController] Job aborted, sending chat.abort', { streamId });
          await client.chatAbort({ sessionKey, runId: lastRunId }).catch(() => {});
          break;
        }
      }
    } catch (err) {
      logger.error('[OpenClawController] Streaming error', err);
      await GenerationJobManager.emitChunk(streamId, {
        final: true,
        error: true,
        errorMessage: err instanceof Error ? err.message : 'Unknown streaming error',
      } as never);
    }
  })().catch((err) => {
    logger.error('[OpenClawController] Unhandled error in streaming task', err);
  });

  void job; // used — just avoids unused var lint
}

/**
 * Express-style handler: creates the job, returns { streamId, conversationId } immediately,
 * then kicks off streaming in the background.
 */
export async function openClawChatHandler(
  req: ServerRequest & { body: Record<string, unknown> },
  res: { json: (body: unknown) => void; status: (code: number) => { json: (body: unknown) => void } },
): Promise<void> {
  const {
    text,
    conversationId: reqConversationId,
    endpointOption = {},
  } = req.body as {
    text: string;
    conversationId?: string;
    endpointOption?: Record<string, unknown>;
  };

  const conversationId =
    !reqConversationId || reqConversationId === 'new' ? randomUUID() : reqConversationId;

  const userId = req.user?.id ?? '';

  // Resolve gateway config from endpointOption
  const gatewayUrl = (endpointOption.reverseProxyUrl as string | undefined) ?? 'ws://127.0.0.1:18789';
  const apiKey = (endpointOption.apiKey as string | undefined) ?? '';
  const model = endpointOption.model as string | undefined;
  const thinkLevel = ((endpointOption.customParams as Record<string, unknown> | undefined)
    ?.thinkingLevel as string | undefined) ?? 'medium';

  // Retrieve existing session key from conversation doc (lazy import avoids circular deps)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getConvo, saveConvo } = require('~/models') as {
    getConvo: (user: string, convId: string) => Promise<{ openclawSessionKey?: string } | null>;
    saveConvo: (
      req: unknown,
      data: Record<string, unknown>,
      meta: { context: string },
    ) => Promise<void>;
  };

  const convo = await getConvo(userId, conversationId);
  const existingSessionKey = convo?.openclawSessionKey ?? null;

  res.json({ streamId: conversationId, conversationId, status: 'started' });

  await runOpenClawChat({
    req,
    conversationId,
    text,
    existingSessionKey,
    gatewayUrl,
    apiKey,
    model,
    thinkLevel,
    onSessionKey: async (sessionKey) => {
      await saveConvo(
        req,
        { conversationId, openclawSessionKey: sessionKey, endpoint: EModelEndpoint.openclaw },
        { context: 'openclaw/controller.ts - onSessionKey' },
      );
    },
  });
}
