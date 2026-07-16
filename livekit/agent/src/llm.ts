import { DEFAULT_API_CONNECT_OPTIONS, llm, log, shortuuid } from '@livekit/agents';
import { ApprovalEvents, Constants, StepEvents, StepTypes } from 'librechat-data-provider';

import type { APIConnectOptions, ChatContext, ToolContextLike } from '@livekit/agents';

import { parseSseStream } from './sse.js';
import { SpeechFilter } from './speech.js';
import type { VoiceSessionClaim } from './claim.js';
import type { WorkerEnv } from './env.js';

export const HITL_BAIL =
  'That step needs your approval in the chat window, so I have left it there for you.';

export const ERROR_BAIL = 'Sorry, something went wrong on my end. Please try again.';

interface TextPart {
  type?: string;
  text?: string;
}

interface MessageDeltaPayload {
  id?: string;
  delta?: { content?: TextPart[] };
}

interface RunStepPayload {
  stepDetails?: { type?: string };
}

interface StreamStart {
  streamId: string;
  conversationId: string;
}

const latestUserText = (chatCtx: ChatContext): string => {
  const items = chatCtx.items;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.type === 'message' && item.role === 'user') {
      return item.textContent ?? '';
    }
  }
  return '';
};

const speakableFrom = (payload: MessageDeltaPayload): string =>
  (payload.delta?.content ?? [])
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');

/**
 * The bridge: LiveKit thinks this is a model, but it holds no model and no prompt. Each
 * turn is an ordinary `POST /api/agents/chat/:endpoint`, so tools, MCP, memory, model
 * params, moderation, ACLs, usage, titles, and persistence all come from the same code
 * path as text chat, and cannot drift because there is no second copy.
 */
export class LibreChatLLM extends llm.LLM {
  /**
   * LibreChat rebuilds history from Mongo via the parent chain, so the worker only has to
   * remember where the conversation is — never what was said.
   */
  parentMessageId: string = Constants.NO_PARENT;

  /** Set while a turn is in flight, so a barge-in can be reconciled against it. */
  activeStreamId: string | null = null;
  activeFilter: SpeechFilter | null = null;

  /** Speech handed to TTS this turn; playback shorter than this means the caller cut in. */
  get spokenLength(): number {
    return this.activeFilter?.spokenLength ?? 0;
  }

  /**
   * Fired when a turn starts a tool call before saying anything. For an agent the dominant
   * source of dead air is a multi-second MCP call, not time-to-first-token — and this is
   * only knowable because we subscribe to a semantic event stream rather than to audio.
   * A speech-to-speech model structurally cannot do this.
   */
  onToolActivity?: () => void;

  constructor(
    readonly claim: VoiceSessionClaim,
    readonly env: WorkerEnv,
  ) {
    super();
  }

  label(): string {
    return 'librechat.LibreChatLLM';
  }

  /**
   * Cuts the persisted message back to what was actually heard.
   *
   * LiveKit truncates its own chat context on interruption, but we ignore that context
   * entirely — the database is the transcript, and `BaseClient` rebuilds the next turn from
   * Mongo. Without this the model's next turn is built from words nobody heard, and the
   * divergence compounds with every interruption.
   */
  async reconcileBargeIn(spokenCharacters: number): Promise<void> {
    const streamId = this.activeStreamId;
    const filter = this.activeFilter;
    if (!streamId || !filter) {
      return;
    }
    this.activeStreamId = null;

    await fetch(`${this.env.librechatUrl}/api/agents/chat/abort`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.claim.callbackToken}`,
      },
      body: JSON.stringify({
        streamId,
        conversationId: this.claim.conversationId,
        truncateAt: filter.sourceOffsetFor(spokenCharacters),
      }),
    });
  }

  chat({
    chatCtx,
    toolCtx,
    connOptions,
  }: {
    chatCtx: ChatContext;
    toolCtx?: ToolContextLike;
    connOptions?: APIConnectOptions;
  }): llm.LLMStream {
    return new LibreChatLLMStream(this, {
      chatCtx,
      toolCtx,
      connOptions: connOptions ?? DEFAULT_API_CONNECT_OPTIONS,
    });
  }
}

export class LibreChatLLMStream extends llm.LLMStream {
  #bridge: LibreChatLLM;
  #filter = new SpeechFilter();
  #chunkId = shortuuid();

  /** Total speech emitted this turn; a shorter played-back item means a barge-in. */
  get spokenLength(): number {
    return this.#filter.spokenLength;
  }

  constructor(
    bridge: LibreChatLLM,
    options: { chatCtx: ChatContext; toolCtx?: ToolContextLike; connOptions: APIConnectOptions },
  ) {
    super(bridge, options);
    this.#bridge = bridge;
  }

  protected async run(): Promise<void> {
    const text = latestUserText(this.chatCtx);
    if (text.trim().length === 0) {
      return;
    }

    const start = await this.#startTurn(text);
    this.#bridge.activeStreamId = start.streamId;
    this.#bridge.activeFilter = this.#filter;
    await this.#consume(start.streamId);
  }

  /**
   * Sends only the newest user turn. `chatCtx` is deliberately ignored beyond this: the
   * database is the transcript, and LibreChat rebuilds the rest of the conversation.
   */
  async #startTurn(text: string): Promise<StreamStart> {
    const { claim, env } = this.#bridge;
    const response = await fetch(`${env.librechatUrl}/api/agents/chat/${claim.endpoint}`, {
      method: 'POST',
      signal: this.abortController.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${claim.callbackToken}`,
      },
      body: JSON.stringify({
        text,
        conversationId: claim.conversationId,
        parentMessageId: this.#bridge.parentMessageId,
        endpoint: claim.endpoint,
        ...(claim.agentId && { agent_id: claim.agentId }),
        ...(claim.model && { model: claim.model }),
        isRegenerate: false,
        isContinued: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `[livekit-agent] chat request failed (${response.status}): ${await response.text()}`,
      );
    }

    return (await response.json()) as StreamStart;
  }

  async #consume(streamId: string): Promise<void> {
    const { claim, env } = this.#bridge;
    const response = await fetch(`${env.librechatUrl}/api/agents/chat/stream/${streamId}`, {
      signal: this.abortController.signal,
      headers: {
        accept: 'text/event-stream',
        authorization: `Bearer ${claim.callbackToken}`,
      },
    });

    if (!response.ok || !response.body) {
      throw new Error(`[livekit-agent] stream subscribe failed (${response.status})`);
    }

    for await (const event of parseSseStream(response.body)) {
      if (this.#handleEvent(event)) {
        return;
      }
    }
    this.#speak(this.#filter.flush());
  }

  /** Returns true when the turn is over. */
  #handleEvent(event: Record<string, unknown>): boolean {
    /**
     * `hitlCapable` is hardcoded true in AgentClient with no per-request opt-out, so a voice
     * turn can enter an approval state that has no representation in audio. Without this
     * bail the call would sit in silence until the caller hangs up.
     */
    if (event.event === ApprovalEvents.ON_PENDING_ACTION) {
      this.#speak(`${this.#filter.flush()} ${HITL_BAIL}`);
      return true;
    }

    if (event.event === StepEvents.ON_RUN_STEP) {
      const payload = event.data as RunStepPayload | undefined;
      if (payload?.stepDetails?.type === StepTypes.TOOL_CALLS && this.#filter.spokenLength === 0) {
        this.#bridge.onToolActivity?.();
      }
      return false;
    }

    if (event.event === StepEvents.ON_MESSAGE_DELTA) {
      const payload = event.data as MessageDeltaPayload | undefined;
      if (payload) {
        this.#speak(this.#filter.push(speakableFrom(payload)));
      }
      return false;
    }

    if (event.final === true) {
      this.#speak(this.#filter.flush());
      this.#bridge.activeStreamId = null;
      const responseMessage = event.responseMessage as { messageId?: string } | undefined;
      if (responseMessage?.messageId) {
        this.#bridge.parentMessageId = responseMessage.messageId;
      }
      return true;
    }

    if (typeof event.error !== 'undefined' && event.error !== null) {
      log().error({ error: event.error }, '[livekit-agent] run reported an error');
      this.#speak(`${this.#filter.flush()} ${ERROR_BAIL}`);
      return true;
    }

    return false;
  }

  #speak(text: string): void {
    if (text.trim().length === 0) {
      return;
    }
    this.queue.put({
      id: this.#chunkId,
      delta: { role: 'assistant', content: text },
    });
  }
}
