import { defineAgent, inference, log, voice } from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';

import type { JobContext } from '@livekit/agents';

import { LibreChatLLM } from './llm.js';
import { readWorkerEnv } from './env.js';
import { createStt, createTts } from './providers.js';
import { claimSession, readSessionId } from './claim.js';

/**
 * The agent carries no instructions on purpose.
 *
 * LibreChat owns thinking — the system prompt, tools, MCP, memory, model params — and the
 * worker owns only the media plane. Giving this agent a prompt would create a second brain
 * that silently diverges from what text chat does, and would change what gets persisted for
 * readers who open the conversation later. Do not "fix" this.
 */
const EMPTY_INSTRUCTIONS = '';

const TOOL_NARRATION = 'Let me look that up.';

export default defineAgent({
  prewarm: (proc) => {
    /** Loading Silero here keeps the model load off the first turn's latency budget. */
    proc.userData.vad = silero.VAD.load();
  },

  entry: async (ctx: JobContext): Promise<void> => {
    const logger = log();
    const env = readWorkerEnv();

    const sessionId = readSessionId(ctx.job.metadata);
    const claim = await claimSession(sessionId, env);

    await ctx.connect();

    const vad = await (ctx.proc.userData.vad as Promise<silero.VAD> | undefined);

    const bridge = new LibreChatLLM(claim, env);

    const session = new voice.AgentSession({
      vad,
      stt: createStt(claim.stt),
      tts: createTts({ ...claim.tts, voice: claim.voice ?? claim.tts.voice }),
      llm: bridge,
      /**
       * Semantic end-of-turn detection rather than a silence timer — fixed timers are what
       * make a voice bot feel robotic. `v1-mini` is the local in-process model, so this
       * works self-hosted without cloud inference credentials.
       */
      turnDetection: new inference.TurnDetector({ version: 'v1-mini' }),
      /** Endpointing delays bound the detector; they belong to the session, not the model. */
      ...(claim.turnDetection?.minEndpointingDelay != null && {
        minEndpointingDelay: claim.turnDetection.minEndpointingDelay,
      }),
      ...(claim.turnDetection?.maxEndpointingDelay != null && {
        maxEndpointingDelay: claim.turnDetection.maxEndpointingDelay,
      }),
    });

    /**
     * `addToChatCtx: false` keeps this out of the conversation: it is a UX filler covering
     * tool latency, not something the agent said, and it must never reach the transcript.
     */
    bridge.onToolActivity = () => {
      session.say(TOOL_NARRATION, { addToChatCtx: false, allowInterruptions: true });
    };

    /**
     * A barge-in leaves the persisted message longer than what the caller heard. The played
     * item's text is the ground truth for playback, so anything shorter than what we handed
     * to TTS means the caller cut in — reconcile the database back to the heard prefix.
     */
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      const item = event.item;
      if (item.type !== 'message' || item.role !== 'assistant') {
        return;
      }
      const heard = item.textContent?.length ?? 0;
      if (heard >= bridge.spokenLength) {
        return;
      }
      bridge.reconcileBargeIn(heard).catch((error) => {
        logger.error({ error }, '[livekit-agent] failed to reconcile barge-in');
      });
    });

    await session.start({
      agent: new voice.Agent({ instructions: EMPTY_INSTRUCTIONS }),
      room: ctx.room,
    });

    logger.info(
      { room: ctx.room.name, conversationId: claim.conversationId },
      '[livekit-agent] voice session started',
    );
  },
});
